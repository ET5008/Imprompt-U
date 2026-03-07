import { createContext, useContext, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { AppState, AppAction, Theme } from '../types';

const initialState: AppState = {
  phase: 'upload',
  theme: 'ice-cream',
  uploadedFiles: [],
  session: null,
  sidebarOpen: false,
  chatHistory: [],
  silenceStartedAt: null,
  summary: null,
  viewingHistory: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_FILES':
      return {
        ...state,
        uploadedFiles: [...state.uploadedFiles, ...action.files].slice(0, 1),
      };
    case 'REMOVE_FILE':
      return {
        ...state,
        uploadedFiles: state.uploadedFiles.filter((f) => f.id !== action.id),
      };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_SESSION':
      return { ...state, session: action.session };
    case 'APPEND_MESSAGE':
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          messages: [...state.session.messages, action.message],
        },
      };
    case 'UPDATE_STREAMING_MESSAGE':
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          messages: state.session.messages.map((m) =>
            m.id === action.id ? { ...m, content: action.content } : m
          ),
        },
      };
    case 'FINISH_STREAMING':
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          messages: state.session.messages.map((m) =>
            m.id === action.id ? { ...m, isStreaming: false } : m
          ),
        },
      };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'OPEN_SIDEBAR':
      return { ...state, sidebarOpen: true };
    case 'CLOSE_SIDEBAR':
      return { ...state, sidebarOpen: false };
    case 'RESTORE_SESSION':
      return {
        ...state,
        session: action.session,
        phase: 'questioning',
        sidebarOpen: false,
        viewingHistory: true,
      };
    case 'SET_THEME': {
      const theme: Theme = action.theme;
      document.documentElement.setAttribute('data-theme', theme);
      return { ...state, theme };
    }
    case 'SET_SILENCE_START':
      return { ...state, silenceStartedAt: action.time };
    case 'SET_SUMMARY':
      return { ...state, summary: action.summary };
    case 'START_NEW_CHAT': {
      const prevSession = state.session;
      return {
        ...state,
        phase: 'upload',
        uploadedFiles: [],
        session: null,
        sidebarOpen: false,
        silenceStartedAt: null,
        summary: null,
        viewingHistory: false,
        chatHistory: prevSession && !state.viewingHistory
          ? [prevSession, ...state.chatHistory]
          : state.chatHistory,
      };
    }
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
