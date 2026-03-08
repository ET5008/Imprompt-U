import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../../context/AppContext';
import { FileList } from './FileList';
import { Button } from '../ui/Button';
import type { UploadedFile } from '../../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function UploadZone() {
  const { state, dispatch } = useAppContext();
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
    dispatch({ type: 'SET_PHASE', phase: 'loading' });
    // TODO: replace timeout with real backend PDF parsing call that returns chapters
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    dispatch({
      type: 'SET_CHAPTERS',
      fileName: state.uploadedFiles[0]?.name ?? 'Textbook.pdf',
      chapters: [
        { id: '1', title: 'Introduction', subject: 'Overview', completed: false },
        { id: '2', title: 'Core Concepts', subject: 'Fundamentals', completed: false },
        { id: '3', title: 'Methods & Approaches', subject: 'Methodology', completed: false },
        { id: '4', title: 'Case Studies', subject: 'Applications', completed: false },
      ],
    });
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
        disabled={state.uploadedFiles.length === 0}
        onClick={handleStart}
      >
        Start Teaching Pimpy!
      </Button>
    </div>
  );
}
