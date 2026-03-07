// API client — stubs return mock data until backend routes are implemented.
// Replace the stub implementations with real fetch calls when backend is ready.

const BASE_URL = '/api';

export interface StartSessionResponse {
  sessionId: string;
  firstQuestion: string;
}

export interface SendMessageResponse {
  reply: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// STUB: replace with real FormData POST when backend route exists
export async function startSession(
  _files: { name: string; type: string }[]
): Promise<StartSessionResponse> {
  await delay(1500);
  return {
    sessionId: `mock-${Date.now()}`,
    firstQuestion:
      "In your own words, can you explain the main concept from your notes and why it matters?",
  };
}

// STUB: replace with SSE streaming fetch when backend route exists
export async function sendMessage(
  _sessionId: string,
  _content: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  await delay(900);

  // Mixed responses: ~40% confused/struggling, ~60% positive
  const confusedReplies = [
    "Hmm, I'm not quite following that. Can you try explaining it a different way?",
    "Wait, I'm confused — what does that actually mean? Can you break it down more simply?",
    "That's not quite right. Think about it again — what's the core idea here?",
    "I don't think I understand. Can you walk me through that step by step?",
  ];
  const positiveReplies = [
    "Excellent! You're really getting it. Now, what would happen if you changed one of those key factors?",
    "Great explanation! How does this connect to something else you've studied?",
    "Spot on! Can you give me a real-world example to make it even clearer?",
    "Perfect, that makes sense! What do you think is the most important takeaway from this concept?",
    "I love that answer! Can you go even deeper — what are the underlying mechanisms at work?",
  ];

  const isConfused = Math.random() < 0.4;
  const pool = isConfused ? confusedReplies : positiveReplies;
  const reply = pool[Math.floor(Math.random() * pool.length)];

  const words = reply.split(' ');
  for (const word of words) {
    await delay(60);
    onChunk(word + ' ');
  }
}

export interface SessionSummaryResponse {
  masteryScore: number;
  strongTopics: string[];
  weakTopics: string[];
}

// STUB: replace with real summary endpoint when backend route exists
export async function finishSession(
  _sessionId: string
): Promise<SessionSummaryResponse> {
  await delay(600);
  return {
    masteryScore: Math.floor(Math.random() * 35) + 55, // 55–90
    strongTopics: ['Core definitions', 'Cause & effect relationships', 'Real-world applications'],
    weakTopics: ['Underlying mechanisms', 'Edge cases & exceptions'],
  };
}
