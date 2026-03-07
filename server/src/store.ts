// where session data is stored 
// sessions should be a map of session ids to session data
interface Session {
    id: string; 
    filename: string; 
    topics: Topic[]; 
    createdAt: Date;
}

interface Topic {
    id: string; 
    title: string; 
    chapter?: string; 
    content: string; 
}

const sessions: Map<string, Session> = new Map();
const reviewSessions: Map<string, ReviewSession> = new Map();