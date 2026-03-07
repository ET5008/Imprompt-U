import { useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { MessageBubble } from './MessageBubble';

export function ChatWindow() {
  const { state } = useAppContext();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.session?.messages.length]);

  const messages = state.session?.messages ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <p className="font-body text-sm text-[#6B4545] text-center mt-8">
          Loading your first question...
        </p>
      ) : (
        messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}
