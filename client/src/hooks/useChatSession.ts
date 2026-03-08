import { useAppContext } from '../context/AppContext';
import { uploadPdf, startSessionForTopic, sendMessage } from '../api/client';
import type { UploadedFile, Message, ChatSession, Chapter } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useChatSession() {
  const { state, dispatch } = useAppContext();

  // Step 1: Upload PDF, extract topics, show chapter selection
  async function uploadFiles(files: UploadedFile[]): Promise<void> {
    const file = files[0]?.file;
    if (!file) throw new Error('No file provided');

    try {
      const topics = await uploadPdf(file);

      const chapters: Chapter[] = topics.map((t) => ({
        id: t.id,
        title: t.title,
        subject: t.chapter ?? 'General',
        completed: false,
      }));

      dispatch({ type: 'SET_CHAPTERS', chapters, fileName: file.name });
    } catch (err) {
      dispatch({ type: 'SET_PHASE', phase: 'upload' });
      dispatch({
        type: 'SET_UPLOAD_ERROR',
        error: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      });
      throw err;
    }
  }

  // Step 2: Start a session for a selected chapter
  async function startChapterSession(chapter: Chapter): Promise<void> {
    dispatch({ type: 'SET_PHASE', phase: 'generating' });

    try {
      const { reviewKey, recallPrompt } = await startSessionForTopic(chapter.id);

      const recallMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: recallPrompt,
        timestamp: new Date(),
      };

      const session: ChatSession = {
        id: reviewKey,
        reviewKey,
        messages: [recallMessage],
        topic: chapter.title,
        createdAt: new Date(),
      };

      dispatch({ type: 'SET_SESSION', session });
      dispatch({ type: 'SET_PHASE', phase: 'questioning' });
      dispatch({ type: 'SET_SILENCE_START', time: new Date() });
    } catch (err) {
      dispatch({ type: 'SET_PHASE', phase: 'chapters' });
      throw err;
    }
  }

  async function submitAnswer(content: string): Promise<void> {
    if (!state.session) return;

    const { reviewKey } = state.session;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    dispatch({ type: 'APPEND_MESSAGE', message: userMessage });
    dispatch({ type: 'SET_PHASE', phase: 'ai_thinking' });

    const streamingId = generateId();
    const streamingMessage: Message = {
      id: streamingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };

    dispatch({ type: 'APPEND_MESSAGE', message: streamingMessage });

    try {
      let accumulated = '';
      const { masteryReached, masteryPercent } = await sendMessage(reviewKey, content, (chunk) => {
        accumulated += chunk;
        dispatch({ type: 'UPDATE_STREAMING_MESSAGE', id: streamingId, content: accumulated });
      });

      dispatch({ type: 'FINISH_STREAMING', id: streamingId });
      dispatch({ type: 'UPDATE_MASTERY', masteryReached, masteryPercent });

      if (!masteryReached) {
        dispatch({ type: 'SET_PHASE', phase: 'questioning' });
        dispatch({ type: 'SET_SILENCE_START', time: new Date() });
      }
    } catch (err) {
      dispatch({ type: 'FINISH_STREAMING', id: streamingId });
      dispatch({ type: 'SET_PHASE', phase: 'questioning' });
      throw err;
    }
  }

  return { uploadFiles, startChapterSession, submitAnswer };
}
