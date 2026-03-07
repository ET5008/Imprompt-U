import { motion } from 'framer-motion';
import { useAppContext } from '../../context/AppContext';
import { Button } from '../ui/Button';
import { sidebarTimer } from './sidebarTimer';

export function Sidebar() {
  const { state, dispatch } = useAppContext();

  function handleMouseEnter() {
    if (sidebarTimer.ref) clearTimeout(sidebarTimer.ref);
  }

  function handleMouseLeave() {
    sidebarTimer.ref = setTimeout(() => {
      dispatch({ type: 'CLOSE_SIDEBAR' });
    }, 500);
  }

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  return (
    <motion.aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      initial={false}
      animate={{ x: state.sidebarOpen ? 0 : -300 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="sidebar fixed left-0 top-0 h-full w-[280px] z-40 flex flex-col shadow-lg"
    >
      <div className="p-5 border-b-2 border-[#452B2B]">
        <h2 className="font-sketch text-2xl font-bold text-[#452B2B]">Imprompt-U</h2>
        <p className="font-body text-sm text-[#6B4545] mt-0.5">Your study sessions</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {state.chatHistory.length === 0 ? (
          <p className="font-body text-sm text-[#6B4545] text-center mt-8">
            No previous sessions yet.
          </p>
        ) : (
          state.chatHistory.map((session) => (
            <button
              key={session.id}
              onClick={() => dispatch({ type: 'RESTORE_SESSION', session })}
              className="w-full text-left sketch-card p-3 hover:bg-[#F3C8D7]/40 transition-colors cursor-pointer"
            >
              <p className="font-sketch text-base font-semibold text-[#452B2B] truncate">
                {session.topic ?? 'Study Session'}
              </p>
              <p className="font-body text-xs text-[#6B4545] mt-0.5">
                {formatDate(session.createdAt)}
              </p>
              <p className="font-body text-xs text-[#6B4545]">
                {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
              </p>
            </button>
          ))
        )}
      </div>

      <div className="p-4 border-t-2 border-[#452B2B]">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => dispatch({ type: 'START_NEW_CHAT' })}
        >
          + New Session
        </Button>
      </div>
    </motion.aside>
  );
}
