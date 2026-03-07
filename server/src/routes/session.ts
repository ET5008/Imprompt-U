import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { reviewStore } from '../store';
import { Message } from '../types';

const sessionRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

async function buildKnowledgeGap(systemPrompt: string, userMessages: string[]): Promise<string> {
  if (userMessages.length === 0) return '';

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `You are an expert analyst. You will be given:
1. The full text of a textbook chapter (inside the system prompt below).
2. Everything the student has said so far in their own words.

Your job:
- Identify what concepts from the chapter the student has demonstrated understanding of.
- Identify what concepts from the chapter the student has NOT addressed or has addressed incorrectly.
- Return ONLY a concise bullet list of the knowledge gaps — concepts still not understood or not yet demonstrated. No preamble.

Chapter context:
${systemPrompt}`,
    messages: [
      {
        role: 'user',
        content: `Here is everything the student has said so far:\n\n${userMessages.join('\n\n')}`,
      },
    ],
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

sessionRouter.post('/message', async (req: Request, res: Response) => {
  const { reviewKey, content } = req.body as { reviewKey?: string; content?: string };

  if (!reviewKey || !content) {
    res.status(400).json({ error: 'reviewKey and content are required' });
    return;
  }

  const reviewSession = reviewStore.get(reviewKey);
  if (!reviewSession) {
    res.status(404).json({ error: 'Review session not found' });
    return;
  }

  if (reviewSession.masteryReached) {
    res.status(400).json({ error: 'Session already completed' });
    return;
  }

  const userMessage: Message = { role: 'user', content, timestamp: new Date() };
  reviewSession.messages.push(userMessage);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const userMessages = reviewSession.messages
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const knowledgeGap = await buildKnowledgeGap(reviewSession.systemPrompt, userMessages);

  const gapContext = knowledgeGap
    ? `\n\n--- KNOWLEDGE GAP ANALYSIS ---\nBased on everything the student has said so far, these are the concepts they have NOT yet demonstrated understanding of:\n${knowledgeGap}\n\nFocus your next question specifically on one of these gaps. Do not ask about concepts the student has already shown they understand.\n--- END ANALYSIS ---`
    : '';

  const apiMessages = reviewSession.messages.map((m: Message) => ({ role: m.role, content: m.content }));

  let fullResponse = '';

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: reviewSession.systemPrompt + gapContext,
      messages: apiMessages,
    });

    stream.on('text', (chunk) => {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    await stream.finalMessage();

    const masteryReached = fullResponse.includes('[MASTERY_REACHED]');
    const cleanedResponse = fullResponse.replace('[MASTERY_REACHED]', '').trimEnd();

    const assistantMessage: Message = {
      role: 'assistant',
      content: cleanedResponse,
      timestamp: new Date(),
    };
    reviewSession.messages.push(assistantMessage);

    if (masteryReached) {
      reviewSession.masteryReached = true;
    }

    res.write(`data: ${JSON.stringify({ done: true, masteryReached })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

export default sessionRouter;
