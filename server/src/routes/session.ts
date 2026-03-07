import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase';

const sessionRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
const GAP_MODEL = 'claude-haiku-4-5-20251001';

// --- Types ---

interface DbMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface DbReviewSession {
  id: string;
  topic_id: string;
  system_prompt: string;
  chapter_content: string;
  total_concepts: number;
  mastery_percent: number;
  mastery_reached: boolean;
  topics: { title: string } | null;
  messages: DbMessage[];
}

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

function formatGapContext(gapText: string, remainingCount: number): string {
  if (!gapText || remainingCount === 0) return '';
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
      ...(gapContext ? [{ type: 'text' as const, text: gapContext }] : []),
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

  const sanitizedContent = content.replace(/\[MASTERY_REACHED\]/gi, '').trim();
  if (!sanitizedContent) {
    res.status(400).json({ error: 'Message content is empty after sanitization' });
    return;
  }

  // Load review session + messages from Supabase
  const { data: reviewSession, error: sessionError } = await supabase
    .from('review_sessions')
    .select('*, topics(title), messages(*)')
    .eq('id', reviewKey)
    .order('created_at', { referencedTable: 'messages', ascending: true })
    .single() as { data: DbReviewSession | null; error: unknown };

  if (sessionError || !reviewSession) {
    res.status(404).json({ error: 'Review session not found' });
    return;
  }

  if (reviewSession.mastery_reached) {
    res.status(400).json({ error: 'Session already completed' });
    return;
  }

  // Insert user message
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ review_session_id: reviewKey, role: 'user', content: sanitizedContent });

  if (insertError) {
    res.status(500).json({ error: 'Failed to save message' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const allMessages = [...reviewSession.messages, { role: 'user' as const, content: sanitizedContent, created_at: new Date().toISOString(), id: '' }];
    const userMessages = allMessages.filter(m => m.role === 'user').map(m => m.content);
    const isFirstTurn = userMessages.length === 1;

    if (isFirstTurn) {
      const topicTitle = reviewSession.topics?.title ?? 'this topic';
      const openingPrompt = `Before we dive in, take a moment to recall what you already know. In your own words, tell me everything you can remember about **${topicTitle}** — don't look anything up, just share what comes to mind.`;
      res.write(`data: ${JSON.stringify({ chunk: openingPrompt })}\n\n`);

      await supabase.from('messages').insert({ review_session_id: reviewKey, role: 'assistant', content: openingPrompt });

      res.write(`data: ${JSON.stringify({ done: true, masteryReached: false, masteryPercent: 0 })}\n\n`);
      res.end();
      return;
    }

    const { gapText, remainingCount } = await buildKnowledgeGap(reviewSession.chapter_content, userMessages);

    // Lock in total concepts on the second turn (first real recall turn).
    // Use a conditional update (eq total_concepts = 0) to prevent race conditions
    // if two requests arrive simultaneously before the baseline is written.
    let totalConcepts = reviewSession.total_concepts;
    if (totalConcepts === 0 && remainingCount > 0) {
      totalConcepts = remainingCount;
      await supabase
        .from('review_sessions')
        .update({ total_concepts: totalConcepts })
        .eq('id', reviewKey)
        .eq('total_concepts', 0);
    }

    const masteryPercent = totalConcepts > 0
      ? Math.round(((totalConcepts - remainingCount) / totalConcepts) * 100)
      : 0;

    const gapContext = formatGapContext(gapText, remainingCount);
    const apiMessages = allMessages.map(m => ({ role: m.role, content: m.content }));

    const fullResponse = await streamSocraticResponse(
      reviewSession.system_prompt,
      gapContext,
      apiMessages,
      res
    );

    const masteryReached = fullResponse.includes('[MASTERY_REACHED]');
    const cleanedResponse = fullResponse.replace(/\[MASTERY_REACHED\]/g, '').trimEnd();

    // Persist assistant message and updated mastery state
    await Promise.all([
      supabase.from('messages').insert({ review_session_id: reviewKey, role: 'assistant', content: cleanedResponse }),
      supabase.from('review_sessions').update({
        mastery_percent: masteryReached ? 100 : masteryPercent,
        ...(masteryReached ? { mastery_reached: true } : {}),
      }).eq('id', reviewKey),
    ]);

    res.write(`data: ${JSON.stringify({ done: true, masteryReached, masteryPercent: masteryReached ? 100 : masteryPercent })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[session/message] Stream error:', err);
    res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
    res.end();
  }
});

sessionRouter.get('/mastery', async (req: Request, res: Response) => {
  const { reviewKey } = req.query as { reviewKey?: string };

  if (!reviewKey) {
    res.status(400).json({ error: 'reviewKey is required' });
    return;
  }

  const { data, error } = await supabase
    .from('review_sessions')
    .select('mastery_reached, mastery_percent, messages(count)')
    .eq('id', reviewKey)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'Review session not found' });
    return;
  }

  res.json({
    masteryReached: data.mastery_reached,
    masteryPercent: data.mastery_percent,
    turnCount: (data.messages as unknown as { count: number }[])[0]?.count ?? 0,
  });
});

export default sessionRouter;
