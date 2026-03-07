import { motion } from 'framer-motion';
import { ThinkingDots } from '../ui/ThinkingDots';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isAI = message.role === 'assistant';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex ${isAI ? 'justify-start' : 'justify-end'} mb-3`}
    >
      <div
        className={`max-w-[80%] px-4 py-3 font-body text-sm leading-relaxed text-[#452B2B] break-words whitespace-pre-wrap ${
          isAI ? 'ai-bubble' : 'user-bubble'
        }`}
      >
        {message.isStreaming && message.content === '' ? (
          <ThinkingDots />
        ) : (
          <>
            {message.content}
            {message.isStreaming && <ThinkingDots />}
          </>
        )}
      </div>
    </motion.div>
  );
}
