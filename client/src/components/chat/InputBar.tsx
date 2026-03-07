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

  // Reset silence timer on keystroke
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
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
    await submitAnswer(trimmed);
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
    <div className="input-bar px-4 py-3 flex items-end gap-3">
      <VoiceButton
        isListening={isListening}
        isSupported={isSupported}
        onToggle={handleVoiceToggle}
      />
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
        className="flex-1 resize-none border-sketch bg-[#FDF6F0] px-4 py-2.5 font-body text-sm text-[#452B2B] placeholder:text-[#6B4545]/60 outline-none focus:ring-2 focus:ring-[#452B2B]/30 rounded-[10px] min-h-[44px] max-h-[160px] overflow-y-auto disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim() || isDisabled}
        aria-label="Send message"
        className="w-10 h-10 rounded-full bg-[#452B2B] text-[#FDF6F0] flex items-center justify-center hover:bg-[#6B4545] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
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
  );
}
