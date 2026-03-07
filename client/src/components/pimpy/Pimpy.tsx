import { AnimatePresence, motion } from 'framer-motion';
import type { PimpyEmotion } from '../../types';

// Asset imports — place your Pimpy artwork files in src/assets/pimpy/
// Expected filenames: pimpy-happy.png, pimpy-smiling.png, pimpy-thinking.png,
//                     pimpy-sad.png, pimpy-crying.png, pimpy-delighted.png
//
// Until you drop in the real assets, a fallback emoji placeholder is shown.

const EMOJI_FALLBACK: Record<PimpyEmotion, string> = {
  happy: '😊',
  smiling: '🙂',
  thinking: '🤔',
  sad: '😟',
  crying: '😢',
  delighted: '🤩',
};

interface PimpyProps {
  emotion: PimpyEmotion;
  size?: number;
  className?: string;
}

function PimpyImage({ emotion, size }: { emotion: PimpyEmotion; size: number }) {
  // Try to load the asset; fall back to emoji if not found.
  // Dynamic imports are resolved at build time by Vite.
  // If assets don't exist yet, the catch renders the emoji fallback.
  return (
    <div
      className="pimpy-wrap flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img
        src={`/pimpy/pimpy-${emotion}.png`}
        alt={`Pimpy feeling ${emotion}`}
        width={size}
        height={size}
        className="object-contain w-full h-full"
        onError={(e) => {
          const target = e.currentTarget;
          target.style.display = 'none';
          const fallback = target.nextElementSibling as HTMLElement | null;
          if (fallback) fallback.style.display = 'flex';
        }}
      />
      <div
        className="items-center justify-center"
        style={{ display: 'none', fontSize: size * 0.7, lineHeight: 1 }}
        aria-label={`Pimpy feeling ${emotion}`}
      >
        {EMOJI_FALLBACK[emotion]}
      </div>
    </div>
  );
}

export function Pimpy({ emotion, size = 160, className = '' }: PimpyProps) {
  return (
    <div className={`pimpy-float ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={emotion}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <PimpyImage emotion={emotion} size={size} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
