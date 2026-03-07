import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { reviewStore } from '../store';
import { Message } from '../types';

const sessionRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const GAP_MODEL = 'claude-haiku-4-5-20251001';

// --- Knowledge Gap Analysis ---

interface GapResult {
  gapText: string;
  remainingCount: number;
}

function countBullets(text: string): number {
  return text.split('\n').filter(l => /^[-•*]/.test(l.trim())).length;
}

async function buildKnowledgeGap(chapterPrompt: string, userMessages: string[]): Promise<GapResult> {
  if (userMessages.length === 0) return { gapText: '', remainingCount: 0 };

  const response = await anthropic.messages.create({
    model: GAP_MODEL,
    max_tokens: 512,
    system: [
      {
        type: 'text',
        text: `You are an expert analyst. You will be given:
1. The full text of a textbook chapter (below).
2. Everything the student has said so far in their own words.

Your job:
- Identify what concepts from the chapter the student has demonstrated understanding of.
- Identify what concepts the student has NOT addressed or has addressed incorrectly.
- Return ONLY a concise bullet list of the knowledge gaps. No preamble.

Chapter context:
${chapterPrompt}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Here is everything the student has said so far:\n\n${userMessages.join('\n\n')}`,
      },
    ],
  });

  const block = response.content[0];
  const gapText = block.type === 'text' ? block.text : '';
  return { gapText, remainingCount: countBullets(gapText) };
}

function formatGapContext(gapText: string): string {
  if (!gapText) return '';
  return `\n\n--- KNOWLEDGE GAP ANALYSIS ---\nConcepts the student has NOT yet demonstrated understanding of:\n${gapText}\n\nFocus your next question on one of these gaps. Do not re-ask about concepts already understood.\n--- END ANALYSIS ---`;
}

// --- Streaming Response ---

async function streamSocraticResponse(
  chapterPrompt: string,
  gapContext: string,
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  res: Response
): Promise<string> {
  let fullResponse = '';

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: chapterPrompt,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: gapContext,
      },
    ],
    messages: apiMessages,
  });

  stream.on('text', (chunk) => {
    fullResponse += chunk;
    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
  });

  await stream.finalMessage();
  return fullResponse;
}

// --- Route ---

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

  reviewSession.messages.push({ role: 'user', content, timestamp: new Date() });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const userMessages = reviewSession.messages
      .filter((m: Message) => m.role === 'user')
      .map((m: Message) => m.content);

    const { gapText, remainingCount } = await buildKnowledgeGap(reviewSession.systemPrompt, userMessages);

    // On the first turn, lock in the total concept count
    if (reviewSession.totalConcepts === 0 && remainingCount > 0) {
      reviewSession.totalConcepts = remainingCount;
    }

    const masteryPercent = reviewSession.totalConcepts > 0
      ? Math.round(((reviewSession.totalConcepts - remainingCount) / reviewSession.totalConcepts) * 100)
      : 0;

    const gapContext = formatGapContext(gapText);

    const apiMessages = reviewSession.messages.map((m: Message) => ({
      role: m.role,
      content: m.content,
    }));

    const fullResponse = await streamSocraticResponse(
      reviewSession.systemPrompt,
      gapContext,
      apiMessages,
      res
    );

    const masteryReached = fullResponse.includes('[MASTERY_REACHED]');
    const cleanedResponse = fullResponse.replace('[MASTERY_REACHED]', '').trimEnd();

    reviewSession.messages.push({ role: 'assistant', content: cleanedResponse, timestamp: new Date() });

    if (masteryReached) reviewSession.masteryReached = true;

    res.write(`data: ${JSON.stringify({ done: true, masteryReached, masteryPercent: masteryReached ? 100 : masteryPercent })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

sessionRouter.get('/mastery', (req: Request, res: Response) => {
  const { reviewKey } = req.query as { reviewKey?: string };

  if (!reviewKey) {
    res.status(400).json({ error: 'reviewKey is required' });
    return;
  }

  const reviewSession = reviewStore.get(reviewKey);
  if (!reviewSession) {
    res.status(404).json({ error: 'Review session not found' });
    return;
  }

  const userMessages = reviewSession.messages.filter((m: Message) => m.role === 'user');

  res.json({
    masteryReached: reviewSession.masteryReached,
    turnCount: userMessages.length,
  });
});

export default sessionRouter;
