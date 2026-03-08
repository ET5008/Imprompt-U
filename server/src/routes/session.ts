import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const sessionRouter = Router();

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

async function buildKnowledgeGap(_chapterPrompt: string, _userMessages: string[]): Promise<GapResult> {
  // TESTING STUB: Claude calls disabled — returning empty gap to skip token usage
  console.log('[session] [TEST STUB] buildKnowledgeGap skipped — no Claude call');
  return { gapText: '', remainingCount: 0 };
}

function formatGapContext(gapText: string, remainingCount: number): string {
  if (!gapText || remainingCount === 0) return '';
  return `\n\n--- KNOWLEDGE GAP ANALYSIS ---\nConcepts the student has NOT yet demonstrated understanding of:\n${gapText}\n\nFocus your next question on one of these gaps. Do not re-ask about concepts already understood.\n--- END ANALYSIS ---`;
}

// --- Streaming Response ---

async function streamSocraticResponse(
  _chapterPrompt: string,
  _gapContext: string,
  _apiMessages: { role: 'user' | 'assistant'; content: string }[],
  res: Response
): Promise<string> {
  // TESTING STUB: Claude calls disabled — streaming a fake response
  console.log('[session] [TEST STUB] streamSocraticResponse skipped — no Claude call');
  const fakeResponse = '[TEST MODE] Claude is disabled. Upload + session pipeline is working correctly.';
  res.write(`data: ${JSON.stringify({ chunk: fakeResponse })}\n\n`);
  return fakeResponse;
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
