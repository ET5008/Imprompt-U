export type PimpyEmotion = 'happy' | 'smiling' | 'thinking' | 'sad' | 'crying' | 'delighted';

export type AppPhase =
  | 'upload'
  | 'generating'
  | 'questioning'
  | 'typing'
  | 'ai_thinking'
  | 'complete';

export type Theme = 'ice-cream' | 'dark';

export type MessageRole = 'user' | 'assistant';

export type UploadedFileType = 'pdf' | 'image' | 'link';

export interface UploadedFile {
  id: string;
  file?: File;
  type: UploadedFileType;
  name: string;
  previewUrl?: string;
  linkUrl?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  messages: Message[];
  topic?: string;
  createdAt: Date;
}

export interface SessionSummary {
  masteryScore: number;
  strongTopics: string[];
  weakTopics: string[];
  totalQuestions: number;
}

export interface AppState {
  phase: AppPhase;
  theme: Theme;
  uploadedFiles: UploadedFile[];
  session: ChatSession | null;
  sidebarOpen: boolean;
  chatHistory: ChatSession[];
  silenceStartedAt: Date | null;
  summary: SessionSummary | null;
  viewingHistory: boolean;
}

export type AppAction =
  | { type: 'ADD_FILES'; files: UploadedFile[] }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'SET_PHASE'; phase: AppPhase }
  | { type: 'SET_SESSION'; session: ChatSession }
  | { type: 'APPEND_MESSAGE'; message: Message }
  | { type: 'UPDATE_STREAMING_MESSAGE'; id: string; content: string }
  | { type: 'FINISH_STREAMING'; id: string }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'OPEN_SIDEBAR' }
  | { type: 'CLOSE_SIDEBAR' }
  | { type: 'START_NEW_CHAT' }
  | { type: 'RESTORE_SESSION'; session: ChatSession }
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'SET_SILENCE_START'; time: Date | null }
  | { type: 'SET_SUMMARY'; summary: SessionSummary };
