export type PimpyEmotion = 'happy' | 'smiling' | 'thinking' | 'sad' | 'crying' | 'delighted';

export type AppPhase =
  | 'upload'
  | 'loading'
  | 'chapters'
  | 'generating'
  | 'questioning'
  | 'typing'
  | 'ai_thinking'
  | 'complete';

export type Theme = 'ice-cream' | 'dark';

export interface Chapter {
  id: string;
  title: string;
  subject: string;
  masteryScore?: number;
  completed: boolean;
}

export interface TextbookSession {
  id: string;
  fileName: string;
  chapters: Chapter[];
  createdAt: Date;
}

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
  chapters: Chapter[];
  currentChapter: Chapter | null;
  currentFileName: string;
  currentTextbookId: string | null;
  textbookHistory: TextbookSession[];
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
  | { type: 'SET_SUMMARY'; summary: SessionSummary }
  | { type: 'SET_CHAPTERS'; chapters: Chapter[]; fileName: string }
  | { type: 'SELECT_CHAPTER'; chapter: Chapter }
  | { type: 'BACK_TO_CHAPTERS' }
  | { type: 'RESTORE_TEXTBOOK'; session: TextbookSession };
