import { useAppContext } from '../../context/AppContext';
import { sidebarTimer } from './sidebarTimer';

export function SidebarTrigger() {
  const { dispatch } = useAppContext();

  function handleMouseEnter() {
    if (sidebarTimer.ref) clearTimeout(sidebarTimer.ref);
    dispatch({ type: 'OPEN_SIDEBAR' });
  }

  function handleMouseLeave() {
    sidebarTimer.ref = setTimeout(() => {
      dispatch({ type: 'CLOSE_SIDEBAR' });
    }, 500);
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="fixed left-0 top-0 h-full w-4 z-50 cursor-default"
      aria-hidden="true"
    />
  );
}
