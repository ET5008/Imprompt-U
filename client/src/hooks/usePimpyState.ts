import { useMemo } from 'react';
import type { AppPhase, Message, PimpyEmotion } from '../types';

const PRAISE_WORDS = ['great', 'excellent', 'exactly', 'correct', 'well done', 'perfect', 'spot on', 'nice', 'love that', 'love your'];
const CONFUSED_WORDS = ['not quite', 'confused', 'break it down', 'different way', "don't think i understand", 'walk me through', "not right", "try explaining"];
const VERY_CONFUSED_WORDS = ["don't think i understand", "don't understand", 'walk me through that step'];

function hasPraise(message: Message | null): boolean {
  if (!message || message.role !== 'assistant') return false;
  const lower = message.content.toLowerCase();
  return PRAISE_WORDS.some((word) => lower.includes(word));
}

function isConfused(message: Message | null): boolean {
  if (!message || message.role !== 'assistant') return false;
  const lower = message.content.toLowerCase();
  return CONFUSED_WORDS.some((word) => lower.includes(word));
}

function isVeryConfused(message: Message | null): boolean {
  if (!message || message.role !== 'assistant') return false;
  const lower = message.content.toLowerCase();
  return VERY_CONFUSED_WORDS.some((word) => lower.includes(word));
}

export function usePimpyState(
  phase: AppPhase,
  lastMessage: Message | null,
  silenceStartedAt: Date | null
): PimpyEmotion {
  return useMemo(() => {
    if (phase === 'complete') return 'delighted';
    if (phase === 'generating' || phase === 'typing') return 'thinking';
    if (phase === 'upload') return 'happy';

    // During streaming, switch emotion as soon as keywords appear in partial content
    if (phase === 'ai_thinking') {
      if (hasPraise(lastMessage)) return 'delighted';
      if (isVeryConfused(lastMessage)) return 'crying';
      if (isConfused(lastMessage)) return 'sad';
      return 'thinking';
    }

    if (phase === 'questioning') {
      if (hasPraise(lastMessage)) return 'delighted';
      if (isVeryConfused(lastMessage)) return 'crying';
      if (isConfused(lastMessage)) return 'sad';
      if (silenceStartedAt) {
        const elapsed = (Date.now() - silenceStartedAt.getTime()) / 1000;
        if (elapsed >= 15) return 'sad';
      }
      return 'smiling';
    }

    return 'happy';
  }, [phase, lastMessage, silenceStartedAt]);
}
