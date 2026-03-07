interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

class ReviewSession {
    sessionId: string;
    topicId: string;
    systemPrompt: string;
    messages: Message[];
    mastery: number;
    masteryReached: boolean;

    constructor(sessionId: string, topicId: string, systemPrompt: string) {
        this.sessionId = sessionId;
        this.topicId = topicId;
        this.systemPrompt = systemPrompt;
        this.messages = [];
        this.mastery = 0;
        this.masteryReached = false;
    }

    addMessage(message: Message) {
        this.messages.push(message);
    }

    isMasteryReached() {
        return this.mastery >= 100;
    }
}

const createReviewSession = (sessionId: string, topicId: string): ReviewSession => {
    const topic = sessions.get(sessionId)?.topics.find(topic => topic.id === topicId);
    if (!topic) {
        throw new Error(`Topic ${topicId} not found for session ${sessionId}`);
    }

    const systemPrompt = `
    You are a Socratic tutor helping a student master the following topic: "${topic.title}".
    
    Your role is to guide the student to understanding through questions — never lecture or give answers directly. 
    Ask the student to explain concepts in their own words, probe with follow-ups, present edge cases, and 
    correct misconceptions gently by asking better questions.
    
    When you're confident the student has demonstrated mastery, say so explicitly and summarize what they've learned.
    
    ## Reference Material
    The following is the full text of the relevant chapter. Use it as your source of truth.
    
    ---
    ${topic.content}
    ---
    `;

    return new ReviewSession(sessionId, topicId, systemPrompt);
}