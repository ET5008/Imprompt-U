import { useAppContext } from '../context/AppContext';
import { startSession, sendMessage, finishSession } from '../api/client';
import type { UploadedFile, Message, ChatSession } from '../types';

const MAX_FOLLOW_UPS = 5;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useChatSession() {
  const { state, dispatch } = useAppContext();

  async function uploadFiles(files: UploadedFile[]) {
    dispatch({ type: 'SET_PHASE', phase: 'generating' });

    const { sessionId, firstQuestion } = await startSession(
      files.map((f) => ({ name: f.name, type: f.type }))
    );

    const firstMessage: Message = {
      id: generateId(),
      role: 'assistant',
      content: firstQuestion,
      timestamp: new Date(),
    };

    const session: ChatSession = {
      id: sessionId,
      messages: [firstMessage],
      topic: 'Study Session',
      createdAt: new Date(),
    };

    dispatch({ type: 'SET_SESSION', session });
    dispatch({ type: 'SET_PHASE', phase: 'questioning' });
    dispatch({ type: 'SET_SILENCE_START', time: new Date() });
  }

  async function submitAnswer(content: string) {
    if (!state.session) return;

    // Count follow-up questions already asked (AI messages after the first)
    const followUpsSoFar = state.session.messages.filter((m) => m.role === 'assistant').length - 1;
    const isLastQuestion = followUpsSoFar >= MAX_FOLLOW_UPS - 1;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    dispatch({ type: 'APPEND_MESSAGE', message: userMessage });
    dispatch({ type: 'SET_PHASE', phase: 'ai_thinking' });

    if (isLastQuestion) {
      // Skip follow-up — go straight to summary
      const summary = await finishSession(state.session.id);
      dispatch({
        type: 'SET_SUMMARY',
        summary: {
          masteryScore: summary.masteryScore,
          strongTopics: summary.strongTopics,
          weakTopics: summary.weakTopics,
          totalQuestions: MAX_FOLLOW_UPS,
        },
      });
      dispatch({ type: 'SET_PHASE', phase: 'complete' });
    } else {
      const streamingId = generateId();
      const streamingMessage: Message = {
        id: streamingId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      dispatch({ type: 'APPEND_MESSAGE', message: streamingMessage });

      let accumulated = '';
      await sendMessage(state.session.id, content, (chunk) => {
        accumulated += chunk;
        dispatch({ type: 'UPDATE_STREAMING_MESSAGE', id: streamingId, content: accumulated });
      });

      dispatch({ type: 'FINISH_STREAMING', id: streamingId });
      dispatch({ type: 'SET_PHASE', phase: 'questioning' });
      dispatch({ type: 'SET_SILENCE_START', time: new Date() });
    }
  }

  return { uploadFiles, submitAnswer };
}
