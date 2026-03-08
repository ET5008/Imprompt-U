import { useAppContext } from '../context/AppContext';
import { startSession, sendMessage } from '../api/client';
import type { UploadedFile, Message, ChatSession } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useChatSession() {
  const { state, dispatch } = useAppContext();

  async function uploadFiles(files: UploadedFile[]): Promise<void> {
    dispatch({ type: 'SET_PHASE', phase: 'generating' });

    const file = files[0]?.file;
    if (!file) throw new Error('No file provided');

    let reviewKey: string;
    let topicTitle: string;
    let recallPrompt: string;

    try {
      ({ reviewKey, topicTitle, recallPrompt } = await startSession(file));
    } catch (err) {
      dispatch({ type: 'SET_PHASE', phase: 'upload' });
      dispatch({ type: 'SET_UPLOAD_ERROR', error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' });
      throw err;
    }

    // Recall prompt comes directly from the server — no fake init message needed
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
      topic: topicTitle,
      createdAt: new Date(),
    };

    dispatch({ type: 'SET_SESSION', session });
    dispatch({ type: 'SET_PHASE', phase: 'questioning' });
    dispatch({ type: 'SET_SILENCE_START', time: new Date() });
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
      // Clear the stuck streaming bubble and restore the input bar
      dispatch({ type: 'FINISH_STREAMING', id: streamingId });
      dispatch({ type: 'SET_PHASE', phase: 'questioning' });
      throw err;
    }
  }

  return { uploadFiles, submitAnswer };
}
