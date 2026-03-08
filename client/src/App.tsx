import { AnimatePresence, motion } from 'framer-motion';
import { AppProvider, useAppContext } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { SidebarTrigger } from './components/layout/SidebarTrigger';
import { Pimpy } from './components/pimpy/Pimpy';
import { ChapterSelection } from './components/chapters/ChapterSelection';
import { UploadZone } from './components/upload/UploadZone';
import { ChatWindow } from './components/chat/ChatWindow';
import { InputBar } from './components/chat/InputBar';
import { usePimpyState } from './hooks/usePimpyState';


function MainContent() {
  const { state, dispatch } = useAppContext();

  const lastMessage =
    state.session && state.session.messages.length > 0
      ? state.session.messages[state.session.messages.length - 1]
      : null;

  const emotion = usePimpyState(state.phase, lastMessage, state.silenceStartedAt);
  const isUploadPhase = state.phase === 'upload';
  const isLoadingPhase = state.phase === 'loading';
  const isChaptersPhase = state.phase === 'chapters';
  const isCompletePhase = state.phase === 'complete';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AnimatePresence mode="wait">
        {isLoadingPhase ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col items-center justify-center gap-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Pimpy emotion="happy" size={260} />
            </motion.div>
            <div className="text-center">
              <p className="font-sketch text-4xl text-[#452B2B]">Reading your notes...</p>
              <p className="font-body text-sm text-[#6B4545] mt-2">Pimpy is studying hard!</p>
            </div>
          </motion.div>
        ) : isChaptersPhase ? (
          <motion.div
            key="chapters"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35 }}
            className="flex-1 flex flex-col min-h-0 overflow-y-auto"
          >
            <ChapterSelection />
          </motion.div>
        ) : isCompletePhase && state.summary ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 p-8 overflow-y-auto"
          >
            <Pimpy emotion="delighted" size={300} />
            <div className="text-center">
              <h2 className="font-sketch text-4xl font-bold text-fg-primary">Session Complete!</h2>
              <p className="font-body text-base text-fg-muted mt-1">Here's how you did</p>
            </div>

            {/* Mastery score */}
            <div className="sketch-card-lg p-6 w-full max-w-md text-center">
              <p className="font-sketch text-lg text-fg-muted mb-1">Mastery Score</p>
              <p className="font-sketch text-7xl font-bold text-fg-primary leading-none">
                {state.summary.masteryScore}
                <span className="text-3xl">%</span>
              </p>
              <div className="mt-3 h-3 rounded-full bg-[#DDE9DE] overflow-hidden border border-[#452B2B]">
                <motion.div
                  className="h-full bg-[#452B2B] rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${state.summary.masteryScore}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                />
              </div>
            </div>

            <div className="flex gap-4 w-full max-w-md flex-wrap">
              <div className="sketch-card flex-1 p-4 min-w-[180px]">
                <p className="font-sketch text-lg text-[#452B2B] mb-2">Strong Topics ✓</p>
                <ul className="space-y-1">
                  {state.summary.strongTopics.map((t) => (
                    <li key={t} className="font-body text-sm text-fg-primary flex items-start gap-1.5">
                      <span className="text-green-600 shrink-0 mt-0.5">●</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="sketch-card flex-1 p-4 min-w-[180px]">
                <p className="font-sketch text-lg text-[#452B2B] mb-2">Keep Studying ✗</p>
                <ul className="space-y-1">
                  {state.summary.weakTopics.map((t) => (
                    <li key={t} className="font-body text-sm text-fg-primary flex items-start gap-1.5">
                      <span className="text-red-500 shrink-0 mt-0.5">●</span>{t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => dispatch({ type: 'BACK_TO_CHAPTERS' })}
                className="btn-sketch border-sketch font-sketch text-xl px-8 py-3 bg-[#452B2B] text-[#FDF6F0] hover:bg-[#6B4545] transition-colors cursor-pointer rounded-[10px]"
              >
                Back to Chapters
              </button>
              <button
                onClick={() => dispatch({ type: 'START_NEW_CHAT' })}
                className="sketch-card px-3 py-1.5 font-sketch text-sm text-[#452B2B] hover:bg-[#F3C8D7]/40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                ← Home
              </button>
            </div>
          </motion.div>
        ) : isUploadPhase ? (
          <motion.div
            key="upload"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 p-8 overflow-y-auto"
          >
            {/* Sidebar hint */}
            <AnimatePresence>
              {!state.sidebarOpen && (
                <motion.div
                  key="sidebar-hint"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  className="absolute top-10 left-6 z-30 flex items-center gap-2 pointer-events-none"
                >
                  {/* squiggly arrow pointing left */}
                  <svg
                    width="56" height="32"
                    viewBox="0 0 48 28"
                    fill="none"
                    className="-scale-x-100 shrink-0"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2 14 C8 6, 14 22, 20 14 C26 6, 32 22, 38 14 L44 14"
                      stroke="#452B2B"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.6"
                      fill="none"
                    />
                    <path
                      d="M40 9 L44 14 L40 19"
                      stroke="#452B2B"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.6"
                      fill="none"
                    />
                  </svg>
                  <span
                    className="font-sketch text-base text-[#452B2B]/70 leading-tight max-w-[150px]"
                    style={{ transform: 'rotate(-8deg)', display: 'inline-block' }}
                  >
                    view your past study sessions!
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="title-card text-center px-6 py-3 rounded-2xl">
              <h1 className="font-sketch text-7xl font-bold text-fg-primary">Imprompt-U</h1>
              <p className="font-body text-lg text-fg-muted mt-2">
                Teach Pimpy what you know — the best way to learn is to explain!
              </p>
            </div>

            {/* Pimpy */}
            <Pimpy emotion={emotion} size={300} />

            {/* Upload area */}
            <div className="w-full max-w-xl">
              <UploadZone />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Pimpy — large, centered, top half */}
            <div className="relative flex flex-col items-center justify-center gap-2 py-6 shrink-0" style={{ minHeight: '45vh' }}>
              {/* Home button */}
              <motion.button
                onClick={() => dispatch({ type: 'START_NEW_CHAT' })}
                title="Back to home"
                animate={{ x: state.sidebarOpen ? 280 : 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="absolute top-3 left-4 sketch-card px-3 py-1.5 font-sketch text-sm text-[#452B2B] hover:bg-[#F3C8D7]/40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                ← Home
              </motion.button>

              <Pimpy emotion={emotion} size={300} />
              <p className="font-sketch text-xl text-fg-muted">
                {state.viewingHistory
                  ? 'Past session'
                  : state.phase === 'ai_thinking' || state.phase === 'generating'
                  ? 'Hmm, let me think...'
                  : 'Go ahead, teach me!'}
              </p>
            </div>

            {/* Chat panel — bottom half */}
            <div className="flex-1 flex flex-col min-h-0 chat-panel border-t-2 border-[#452B2B]">
              <ChatWindow />
              {state.viewingHistory ? (
                <div className="px-4 py-3 text-center font-body text-sm text-[#6B4545] border-t border-[#452B2B]/20 bg-[#FDF6F0]/60">
                  This is a past session — read only
                </div>
              ) : (
                <InputBar />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AppShell() {
  return (
    <div className="relative h-full flex flex-col">
      <SidebarTrigger />
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-0">
        <MainContent />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
