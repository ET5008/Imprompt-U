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
  const error = state.uploadError;
  const { uploadFiles } = useChatSession();
  const hasFile = state.uploadedFiles.length > 0;
  const [isStarting, setIsStarting] = useState(false);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: hasFile,
    onDrop(acceptedFiles) {
      dispatch({ type: 'SET_UPLOAD_ERROR', error: null });
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
    if (state.uploadedFiles.length === 0 || isStarting) return;
    dispatch({ type: 'SET_UPLOAD_ERROR', error: null });
    setIsStarting(true);
    dispatch({ type: 'SET_PHASE', phase: 'loading' });
    try {
      await uploadFiles(state.uploadedFiles);
    } catch (err) {
      setIsStarting(false);
    }
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
        <p className="font-sketch text-xl text-brown">
          {isDragActive ? 'Drop it here!' : 'Drop your textbook here'}
        </p>
        <p className="font-body text-sm text-brown-light mt-1">
          PDF only
        </p>
        {hasFile && (
          <p className="font-body text-xs text-red-600 mt-2">File already added</p>
        )}
      </div>

      {/* File list */}
      <FileList />

      {/* Error message */}
      {error && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 text-center">
          <p className="font-sketch text-base text-red-600">⚠ {error}</p>
        </div>
      )}

      {/* Start button */}
      <Button
        variant="primary"
        size="lg"
        className="mt-2 w-full"
        disabled={state.uploadedFiles.length === 0 || isStarting}
        onClick={handleStart}
      >
        {isStarting ? 'Processing...' : 'Start Teaching Pimpy!'}
      </Button>
    </div>
  );
}
