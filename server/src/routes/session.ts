import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const sessionRouter = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
const GAP_MODEL = process.env.ANTHROPIC_GAP_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
const MAX_GAP_USER_MESSAGES = Number(process.env.MAX_GAP_USER_MESSAGES ?? 6);
const MAX_CHAT_TURNS = Number(process.env.MAX_CHAT_TURNS ?? 10);
const MAX_GAP_CONTEXT_CHARS = Number(process.env.MAX_GAP_CONTEXT_CHARS ?? 8000);

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
  messages: DbMessage[] | null;
}

interface GapResult {
  gapText: string;
  remainingCount: number;
}

function countGapItems(text: string): number {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Accept bullets, numbered lists, and short standalone concept lines.
  return lines.filter((line) => /^([-*•]|\d+[.)])\s+/.test(line) || line.split(' ').length <= 12).length;
}

function trimContext(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)} [truncated]`;
}

async function buildKnowledgeGap(chapterPrompt: string, userMessages: string[]): Promise<GapResult> {
  if (userMessages.length === 0) return { gapText: '', remainingCount: 0 };

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  try {
    const response = await anthropic.messages.create({
      model: GAP_MODEL,
      max_tokens: 400,
      system: `You are an expert analyst.\nYou will be given chapter context and recent student responses.\n\nTask:\n- Identify concepts still missing or misunderstood\n- Return ONLY a concise bullet list of missing concepts\n\nChapter context:\n${trimContext(chapterPrompt, MAX_GAP_CONTEXT_CHARS)}`,
      messages: [
        {
          role: 'user',
          content: `Recent student responses:\n\n${userMessages.join('\n\n')}`,
        },
      ],
    });

    const first = response.content[0];
    const gapText = first?.type === 'text' ? first.text : '';
    return { gapText, remainingCount: countGapItems(gapText) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[session/gap] Claude gap analysis failed, using empty gap:', msg);
    return { gapText: '', remainingCount: 0 };
  }
}

function formatGapContext(gapText: string, remainingCount: number): string {
  if (!gapText || remainingCount === 0) return '';
  return `\n\n--- KNOWLEDGE GAP ANALYSIS ---\nConcepts the student has NOT yet demonstrated understanding of:\n${gapText}\n\nFocus your next question on one of these gaps. Do not re-ask concepts already understood.\n--- END ANALYSIS ---`;
}

async function streamSocraticResponse(
  chapterPrompt: string,
  gapContext: string,
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  res: Response
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is missing');
  }

  let fullResponse = '';

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 700,
    system: `${chapterPrompt}${gapContext}`,
    messages: apiMessages,
  });

  stream.on('text', (chunk) => {
    fullResponse += chunk;
    res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
  });

  await stream.finalMessage();
  return fullResponse;
}

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

  const { data: reviewSession, error: sessionError } = (await supabase
    .from('review_sessions')
    .select('*, topics(title), messages(*)')
    .eq('id', reviewKey)
    .order('created_at', { referencedTable: 'messages', ascending: true })
    .single()) as { data: DbReviewSession | null; error: unknown };

  if (sessionError || !reviewSession) {
    res.status(404).json({ error: 'Review session not found' });
    return;
  }

  if (reviewSession.mastery_reached) {
    res.status(400).json({ error: 'Session already completed' });
    return;
  }

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
    const existingMessages = Array.isArray(reviewSession.messages) ? reviewSession.messages : [];
    const allMessages = [
      ...existingMessages,
      { role: 'user' as const, content: sanitizedContent, created_at: new Date().toISOString(), id: '' },
    ];

    const userMessages = allMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .slice(-MAX_GAP_USER_MESSAGES);

    const { gapText, remainingCount } = await buildKnowledgeGap(reviewSession.chapter_content, userMessages);

    const hasGapSignal = remainingCount > 0 || gapText.trim().length > 0;
    let totalConcepts = reviewSession.total_concepts;
    if (totalConcepts === 0) {
      // If gap extraction is noisy/empty, start from a stable baseline so mastery can still progress.
      totalConcepts = hasGapSignal ? Math.max(remainingCount, 1) : 8;
      await supabase
        .from('review_sessions')
        .update({ total_concepts: totalConcepts })
        .eq('id', reviewKey)
        .eq('total_concepts', 0);
    }

    let masteryPercent = 0;
    if (hasGapSignal) {
      const boundedRemaining = Math.min(Math.max(remainingCount, 0), totalConcepts);
      masteryPercent = Math.round(((totalConcepts - boundedRemaining) / totalConcepts) * 100);
    } else {
      // Fallback progression: advance with turns when the gap model cannot produce structured counts.
      const userTurnCount = userMessages.length;
      masteryPercent = Math.min(95, Math.round((userTurnCount / totalConcepts) * 100));
    }

    const gapContext = formatGapContext(gapText, remainingCount);

    const apiMessages = allMessages
      .slice(-MAX_CHAT_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.content }));

    const fullResponse = await streamSocraticResponse(
      reviewSession.system_prompt,
      gapContext,
      apiMessages,
      res
    );

    const masteryReached = fullResponse.includes('[MASTERY_REACHED]');
    const cleanedResponse = fullResponse.replace(/\[MASTERY_REACHED\]/g, '').trimEnd();

    await Promise.all([
      supabase.from('messages').insert({ review_session_id: reviewKey, role: 'assistant', content: cleanedResponse }),
      supabase
        .from('review_sessions')
        .update({
          mastery_percent: masteryReached ? 100 : masteryPercent,
          ...(masteryReached ? { mastery_reached: true } : {}),
        })
        .eq('id', reviewKey),
    ]);

    res.write(
      `data: ${JSON.stringify({ done: true, masteryReached, masteryPercent: masteryReached ? 100 : masteryPercent })}\n\n`
    );
    res.end();
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Stream failed';
    const errorMessage = rawMessage.toLowerCase().includes('rate limit')
      ? 'Rate limit hit. Please wait about 60 seconds and try again.'
      : rawMessage;

    console.error('[session/message] Stream error:', err);
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
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
