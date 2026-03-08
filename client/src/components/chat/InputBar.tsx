import { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useChatSession } from '../../hooks/useChatSession';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { VoiceButton } from './VoiceButton';

export function InputBar() {
  const { state, dispatch } = useAppContext();
  const { submitAnswer } = useChatSession();
  const { isSupported, isListening, startListening, stopListening } = useVoiceInput();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDisabled = state.phase === 'ai_thinking' || state.phase === 'generating';

  // Auto-focus textarea when Pimpy finishes responding
  useEffect(() => {
    if (state.phase === 'questioning') {
      textareaRef.current?.focus();
    }
  }, [state.phase]);

  // Track silence timer
  useEffect(() => {
    if (state.phase !== 'questioning') return;
    dispatch({ type: 'SET_SILENCE_START', time: new Date() });
  }, [state.phase, dispatch]);

  const MAX_CHARS = 1200;

  // Reset silence timer on keystroke
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (e.target.value.length > MAX_CHARS) return;
    setText(e.target.value);
    setError(null);
    dispatch({ type: 'SET_PHASE', phase: 'typing' });
    dispatch({ type: 'SET_SILENCE_START', time: null });
  }

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  // Revert to questioning phase when user stops typing
  useEffect(() => {
    if (state.phase !== 'typing') return;
    const timer = setTimeout(() => {
      if (state.phase === 'typing') {
        dispatch({ type: 'SET_PHASE', phase: 'questioning' });
        dispatch({ type: 'SET_SILENCE_START', time: new Date() });
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [text, state.phase, dispatch]);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || isDisabled) return;
    setText('');
    setError(null);
    try {
      await submitAnswer(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send. Please try again.');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleVoiceToggle() {
    if (isListening) {
      stopListening();
    } else {
      startListening((transcript) => {
        setText((prev) => prev + transcript);
      });
    }
  }

  return (
    <div className="input-bar px-4 py-3 flex flex-col gap-2">
      {error && (
        <p className="font-body text-xs text-red-600 text-center">{error}</p>
      )}
      <div className="flex items-end gap-3">
        <VoiceButton
          isListening={isListening}
          isSupported={isSupported}
          onToggle={handleVoiceToggle}
        />
        <div className="flex-1 flex flex-col gap-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder={
              isDisabled ? 'Pimpy is thinking...' : 'Explain it to Pimpy... (Enter to send)'
            }
            rows={1}
            className="w-full resize-none border-sketch bg-cream px-4 py-2.5 font-body text-sm text-brown placeholder:text-brown-light/60 outline-none focus:ring-2 focus:ring-brown/30 rounded-[10px] min-h-11 max-h-40 overflow-y-auto disabled:opacity-50"
          />
          {text.length > 0 && (
            <p className={`font-body text-xs text-right pr-1 ${text.length >= MAX_CHARS ? 'text-red-500' : 'text-brown-light/60'}`}>
              {text.length}/{MAX_CHARS}
            </p>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isDisabled}
          aria-label="Send message"
          className="w-10 h-10 rounded-full bg-brown text-cream flex items-center justify-center hover:bg-brown-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 translate-x-0.5"
          >
            <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
