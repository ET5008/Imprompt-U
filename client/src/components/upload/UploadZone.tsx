import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../../context/AppContext';
import { FileList } from './FileList';
import { Button } from '../ui/Button';
import { useChatSession } from '../../hooks/useChatSession';
import type { UploadedFile } from '../../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function UploadZone() {
  const { state, dispatch } = useAppContext();
  const { uploadFiles } = useChatSession();
  const [isStarting, setIsStarting] = useState(false);

  const hasFile = state.uploadedFiles.length > 0;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: hasFile,
    onDrop(acceptedFiles) {
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: generateId(),
        file,
        type: 'pdf',
        name: file.name,
      }));
      dispatch({ type: 'ADD_FILES', files: newFiles });
    },
  });

  async function handleStart() {
    if (state.uploadedFiles.length === 0) return;
    setIsStarting(true);
    await uploadFiles(state.uploadedFiles);
    setIsStarting(false);
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`upload-zone p-8 text-center cursor-pointer select-none ${isDragActive ? 'drag-active' : ''} ${hasFile ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">📚</div>
        <p className="font-sketch text-xl text-[#452B2B]">
          {isDragActive ? 'Drop it here!' : 'Drop your textbook here'}
        </p>
        <p className="font-body text-sm text-[#6B4545] mt-1">
          PDF only
        </p>
        {hasFile && (
          <p className="font-body text-xs text-red-600 mt-2">File already added</p>
        )}
      </div>

      {/* File list */}
      <FileList />

      {/* Start button */}
      <Button
        variant="primary"
        size="lg"
        className="mt-2 w-full"
        disabled={state.uploadedFiles.length === 0 || isStarting}
        onClick={handleStart}
      >
        {isStarting ? 'Getting ready...' : 'Start Teaching Pimpy!'}
      </Button>
    </div>
  );
}
