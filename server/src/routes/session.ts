import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const sessionRouter = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
const GAP_MODEL = process.env.ANTHROPIC_GAP_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';
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

// Score 0–3 per turn: 0=off-topic/wrong, 1=partial, 2=good, 3=excellent
interface ScoreResult {
  score: 0 | 1 | 2 | 3;
  gapText: string;
}

function trimContext(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)} [truncated]`;
}

async function scoreAnswer(
  chapterContent: string,
  question: string,
  answer: string
): Promise<ScoreResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is missing');

  try {
    const response = await anthropic.messages.create({
      model: GAP_MODEL,
      max_tokens: 300,
      system: `You are a strict but fair tutor evaluating a student's answer.\n\nChapter context:\n${trimContext(chapterContent, MAX_GAP_CONTEXT_CHARS)}`,
      messages: [
        {
          role: 'user',
          content: `Question asked: ${question}\n\nStudent's answer: ${answer}\n\nRate the answer quality on a scale of 0–3:\n0 = wrong, off-topic, or no real attempt\n1 = partially correct but missing key ideas\n2 = mostly correct with good understanding\n3 = excellent, demonstrates clear mastery\n\nAlso briefly list any concepts still not demonstrated (bullet points, or "none").\n\nRespond in exactly this format:\nSCORE: <0|1|2|3>\nGAPS:\n<bullet list or "none">`,
        },
      ],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const scoreMatch = text.match(/SCORE:\s*([0-3])/);
    const score = scoreMatch ? (parseInt(scoreMatch[1]) as 0 | 1 | 2 | 3) : 1;
    const gapsMatch = text.match(/GAPS:\s*([\s\S]*)/);
    const gapText = gapsMatch ? gapsMatch[1].trim() : '';
    return { score, gapText };
  } catch (err) {
    console.error('[session/score] Scoring failed, defaulting to 1:', err instanceof Error ? err.message : err);
    return { score: 1, gapText: '' };
  }
}

// Points awarded per score tier (out of 100 total)
const POINTS_PER_SCORE: Record<0 | 1 | 2 | 3, number> = { 0: 0, 1: 5, 2: 12, 3: 20 };

const SCORE_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: 'The student gave a wrong or off-topic answer. Gently redirect with a simpler question on the same concept.',
  1: 'The student partially understood. Probe deeper on the missing parts before moving on.',
  2: 'The student mostly understood. Briefly affirm and move to the next gap.',
  3: 'The student answered excellently. Affirm and move to the next gap.',
};

function formatGapContext(gapText: string, score: 0 | 1 | 2 | 3): string {
  const scoreGuidance = SCORE_LABELS[score];
  const hasGaps = gapText && gapText.toLowerCase() !== 'none' && gapText.trim().length > 0;
  const gapBlock = hasGaps
    ? `\nConcepts not yet demonstrated:\n${gapText}\n\nAsk about the FIRST unmastered concept in this list.`
    : '\nAll listed concepts appear understood. Emit [MASTERY_REACHED] now unless there is a critical concept you have not touched at all.';
  return `\n\n--- TURN ASSESSMENT ---\n${scoreGuidance}${gapBlock}\n--- END ASSESSMENT ---`;
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

    // Find the last question the tutor asked (to score the student's answer against)
    const existingAssistantMessages = existingMessages.filter((m) => m.role === 'assistant');
    const lastQuestion = existingAssistantMessages[existingAssistantMessages.length - 1]?.content ?? '';

    const { score, gapText } = await scoreAnswer(
      reviewSession.chapter_content,
      lastQuestion,
      sanitizedContent
    );

    // Increment mastery by points earned this turn; never go backward; cap at 95 until [MASTERY_REACHED]
    const points = POINTS_PER_SCORE[score];
    const masteryPercent = Math.min(95, reviewSession.mastery_percent + points);

    const gapContext = formatGapContext(gapText, score);

    const apiMessages = allMessages
      .slice(-MAX_CHAT_TURNS * 2)
      .map((m) => ({ role: m.role, content: m.content }));

    const fullResponse = await streamSocraticResponse(
      reviewSession.system_prompt,
      gapContext,
      apiMessages,
      res
    );

    const masteryReached = fullResponse.includes('[MASTERY_REACHED]') || masteryPercent >= 100;
    const cleanedResponse = fullResponse.replace(/\[MASTERY_REACHED\]/g, '').trimEnd();
    const finalMasteryPercent = masteryReached ? 100 : masteryPercent;

    await Promise.all([
      supabase.from('messages').insert({ review_session_id: reviewKey, role: 'assistant', content: cleanedResponse }),
      supabase
        .from('review_sessions')
        .update({
          mastery_percent: finalMasteryPercent,
          ...(masteryReached ? { mastery_reached: true } : {}),
        })
        .eq('id', reviewKey),
    ]);

    res.write(
      `data: ${JSON.stringify({ done: true, masteryReached, masteryPercent: finalMasteryPercent })}\n\n`
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
