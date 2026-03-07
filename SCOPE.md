# Imprompt-U — Project Scope

## Overview

Imprompt-U is an AI-powered study tool that accepts a textbook PDF, extracts and indexes its content, and conducts an interactive Socratic review session with the user. The AI prompts the user to explain topics, work through examples, and answer questions until mastery is demonstrated.

---

## Frontend (`client/`)

**Stack:** React 19, TypeScript, Vite, Tailwind CSS

### Pages / Views

| View | Description |
|---|---|
| Home / Upload | User uploads a textbook PDF |
| Loading | Progress indicator while the backend parses and indexes the PDF |
| Topic Selection | Lists topics extracted from the PDF; user picks one to review |
| Review Session | Interactive chat-style interface where the AI asks questions and evaluates user responses |
| Session Summary | Shows mastered vs. struggling topics at the end of a session |

### Components

- **PdfUpload** — drag-and-drop or file picker for PDF input
- **TopicList** — scrollable list of extracted topics with chapter/section labels
- **ChatWindow** — scrollable message thread for the review session
- **MessageBubble** — renders individual AI or user messages; supports markdown
- **ProgressIndicator** — shows parsing/indexing status
- **MasteryBadge** — visual indicator of understanding level per topic

### State & Data Flow

- PDF is uploaded to the backend parse endpoint (multipart/form-data)
- Extracted topic list is fetched and displayed for selection
- Selected topic opens a session; messages are sent to the backend AI endpoint and streamed back
- Session state (messages, current topic, mastery status) lives in React state / context

### Non-Goals (Frontend)

- No user authentication in initial scope
- No persistent history across browser sessions (initial scope)

---

## Backend (`server/`)

**Stack:** Node.js, Express, TypeScript

### API Endpoints

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/upload` | Accepts a PDF file, parses content, indexes it, returns a session ID and topic list |
| `GET` | `/api/topics/:sessionId` | Returns the list of extracted topics for a session |
| `POST` | `/api/session/start` | Starts a review session for a given topic and session ID |
| `POST` | `/api/session/message` | Sends a user message; returns the AI's next prompt or evaluation |
| `GET` | `/api/health` | Health check |

### Core Services

**PDF Parser Service**
- Accepts an uploaded PDF file (via `multer`)
- Extracts text content page by page using a PDF parsing library (e.g. `pdf-parse`)
- Identifies chapter and section headings to organize content into topics
- Cleans and normalizes extracted text

**Memory / Storage Service**
- Stores parsed content in-memory per session (keyed by session ID)
- Chunks and indexes content for retrieval during review (RAG pattern)
- Sessions expire after inactivity (TTL-based cleanup)

**AI Service (Claude)**
- Uses the Anthropic SDK to call Claude
- Maintains conversation history per session
- Relevant chunks from the PDF are injected into context for each message
- System prompt instructs Claude to act as a Socratic tutor:
  - Ask the user to explain a concept in their own words
  - Follow up with examples, edge cases, or deeper questions
  - Assess understanding and decide when mastery is reached
  - Never just give the answer — guide the user to it
- Streams responses back to the client

### Data Models

```ts
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
  content: string; // extracted text for this topic
}

interface ReviewSession {
  sessionId: string;
  topicId: string;
  messages: Message[];
  masteryReached: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

### Non-Goals (Backend)

- No database in initial scope — all state is in-memory
- No authentication or user accounts
- No support for scanned/image-based PDFs (text-layer PDFs only)
- No support for EPUB, DOCX, or other formats

---

## Out of Scope (v1)

- User accounts and persistent history
- Scanned PDF / image / video content parsing
- Course website scraping
- Mobile app
- Multi-user / collaborative sessions
