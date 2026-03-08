import { motion } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { useChatSession } from '../../hooks/useChatSession';
import type { Chapter } from '../../types';

export function ChapterSelection() {
  const { state, dispatch } = useAppContext();
  const { uploadFiles } = useChatSession();

  function handleChapterClick(chapter: Chapter) {
    if (state.viewingHistory) return;
    dispatch({ type: 'SELECT_CHAPTER', chapter });
    uploadFiles(state.uploadedFiles);
  }

  const studiedChapters = state.chapters.filter((c) => c.masteryScore !== undefined);
  const avgMastery =
    studiedChapters.length > 0
      ? Math.round(
          studiedChapters.reduce((sum, c) => sum + (c.masteryScore ?? 0), 0) /
            studiedChapters.length
        )
      : null;

  return (
    <div className="flex-1 flex flex-col items-center p-8 overflow-y-auto gap-6">
      {/* Header */}
      <div className="title-card text-center px-6 py-4 rounded-2xl w-full max-w-2xl">
        <p className="font-body text-sm text-fg-muted truncate">{state.currentFileName}</p>
        <h1 className="font-sketch text-5xl font-bold text-fg-primary mt-1">Choose a Chapter</h1>
        {avgMastery !== null && (
          <p className="font-body text-sm text-fg-muted mt-2">
            Overall Mastery:{' '}
            <span className="font-sketch text-xl text-[#452B2B]">{avgMastery}%</span>
          </p>
        )}
      </div>

      {/* Chapter list */}
      <div className="flex flex-col gap-4 w-full max-w-2xl">
        {state.chapters.map((chapter, i) => (
          <motion.button
            key={chapter.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3 }}
            onClick={() => handleChapterClick(chapter)}
            className={`sketch-card p-5 text-left transition-colors ${
              state.viewingHistory
                ? 'cursor-default'
                : 'hover:bg-[#F3C8D7]/40 cursor-pointer'
            }`}
          >
            <p className="font-body text-xs text-[#6B4545] uppercase tracking-wide mb-1">
              {chapter.subject}
            </p>
            <p className="font-sketch text-xl text-[#452B2B] leading-tight">{chapter.title}</p>

            {chapter.masteryScore !== undefined ? (
              <div className="mt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-body text-xs text-[#6B4545]">Mastery</span>
                  <span className="font-sketch text-sm text-[#452B2B]">
                    {chapter.masteryScore}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#DDE9DE] overflow-hidden border border-[#452B2B]">
                  <motion.div
                    className="h-full bg-[#452B2B] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${chapter.masteryScore}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.07 + 0.3 }}
                  />
                </div>
                {chapter.completed
                  ? <p className="font-body text-xs text-green-600 mt-1.5">✓ Completed</p>
                  : <p className="font-body text-xs text-[#6B4545] mt-1.5">Keep studying — need 90% to complete</p>
                }
              </div>
            ) : (
              <p className="font-body text-xs text-[#6B4545] mt-3">Not studied yet</p>
            )}
          </motion.button>
        ))}
      </div>

      {/* Home button */}
      <button
        onClick={() => dispatch({ type: 'START_NEW_CHAT' })}
        className="sketch-card px-3 py-1.5 font-sketch text-sm text-[#452B2B] hover:bg-[#F3C8D7]/40 transition-colors cursor-pointer flex items-center gap-1.5"
      >
        ← Home
      </button>
    </div>
  );
}
