import { AnimatePresence } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { FileChip } from './FileChip';

export function FileList() {
  const { state, dispatch } = useAppContext();

  if (state.uploadedFiles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <AnimatePresence>
        {state.uploadedFiles.map((file) => (
          <FileChip
            key={file.id}
            file={file}
            onRemove={(id) => dispatch({ type: 'REMOVE_FILE', id })}
          />
        ))}
      </AnimatePresence>
      <p className="w-full font-body text-xs text-[#6B4545] text-right">
        {state.uploadedFiles.length}/1 file
      </p>
    </div>
  );
}
