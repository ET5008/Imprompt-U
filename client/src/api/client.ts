const BASE_URL = '/api';

export interface Topic {
  id: string;
  title: string;
  chapter: string | null;
  topic_order: number;
}

export interface StartSessionResponse {
  reviewKey: string;
  topicTitle: string;
  recallPrompt: string;
}

export interface SendMessageResult {
  masteryReached: boolean;
  masteryPercent: number;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function startSession(file: File): Promise<StartSessionResponse> {
  return startSessionReal(file);
}

// STUB: real SSE streaming suspended for UI testing
export async function sendMessage(
  _reviewKey: string,
  _content: string,
  onChunk: (chunk: string) => void
): Promise<SendMessageResult> {
  await new Promise((r) => setTimeout(r, 800));

  const replies = [
    "Hmm, interesting! Can you explain that a bit more — what's the underlying reason for that?",
    "Good start! Now, how does that connect to the broader concept you've been studying?",
    "That's partially right. Think about the edge cases — when might that not hold true?",
    "Nice explanation! Can you give me a concrete real-world example of that?",
    "You're getting there. What would happen if you changed one of those key variables?",
  ];
  const reply = replies[Math.floor(Math.random() * replies.length)];

  const words = reply.split(' ');
  for (const word of words) {
    await new Promise((r) => setTimeout(r, 55));
    onChunk(word + ' ');
  }

  return { masteryReached: false, masteryPercent: 0 };
}

// --- Real implementations (restore when backend is ready) ---

export async function startSessionReal(file: File): Promise<StartSessionResponse> {
  const form = new FormData();
  form.append('pdf', file);

  const uploadRes = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    body: form,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Upload failed');
  }

  const uploadData = (await uploadRes.json()) as { topics: Topic[] };
  const firstTopic = uploadData.topics[0];
  if (!firstTopic) throw new Error('No topics found in uploaded PDF');

  const sessionRes = await fetch(`${BASE_URL}/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicId: firstTopic.id }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to create session');
  }

  const sessionData = (await sessionRes.json()) as { reviewKey: string; recallPrompt: string };
  return { reviewKey: sessionData.reviewKey, topicTitle: firstTopic.title, recallPrompt: sessionData.recallPrompt };
}

export async function sendMessageReal(
  reviewKey: string,
  content: string,
  onChunk: (chunk: string) => void
): Promise<SendMessageResult> {
  const res = await fetch(`${BASE_URL}/session/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewKey, content }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Message failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let masteryReached = false;
  let masteryPercent = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      if (typeof parsed.chunk === 'string') {
        onChunk(parsed.chunk);
      } else if (parsed.done === true) {
        masteryReached = parsed.masteryReached === true;
        masteryPercent = typeof parsed.masteryPercent === 'number' ? parsed.masteryPercent : 0;
      } else if (typeof parsed.error === 'string') {
        throw new Error(parsed.error);
      }
    }
  }

  return { masteryReached, masteryPercent };
}
