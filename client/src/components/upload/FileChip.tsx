import { motion } from 'framer-motion';
import type { UploadedFile } from '../../types';

interface FileChipProps {
  file: UploadedFile;
  onRemove: (id: string) => void;
}

const TYPE_ICONS: Record<UploadedFile['type'], string> = {
  pdf: '📄',
  image: '🖼️',
  link: '🔗',
};

export function FileChip({ file, onRemove }: FileChipProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 sketch-card px-3 py-2 max-w-xs"
    >
      <span className="text-lg shrink-0">{TYPE_ICONS[file.type]}</span>
      <span className="font-body text-sm text-[#452B2B] truncate flex-1" title={file.name}>
        {file.name}
      </span>
      <button
        onClick={() => onRemove(file.id)}
        className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[#452B2B] text-[#FDF6F0] text-xs hover:bg-[#6B4545] transition-colors cursor-pointer"
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
    </motion.div>
  );
}
