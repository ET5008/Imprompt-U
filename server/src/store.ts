export interface Topic {
  id: string;
  title: string;
  chapter?: string;
  content: string;
}

export interface Session {
  id: string;
  filename: string;
  topics: Topic[];
  createdAt: Date;
}

export interface ReviewSession {
  id: string;
  topicId: string;
  systemPrompt: string;
  chapterContent: string;
  totalConcepts: number;
  masteryPercent: number;
  masteryReached: boolean;
  createdAt: Date;
}

export const sessions: Map<string, Session> = new Map();
export const reviewSessions: Map<string, ReviewSession> = new Map();
