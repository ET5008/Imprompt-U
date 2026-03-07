# Imprompt-U — Project Scope

## Overview

Imprompt-U is an AI-powered study tool that accepts a textbook PDF, extracts and organizes its content by chapter/section, and conducts an interactive Socratic review session with the user. The AI prompts the user to explain topics, work through examples, and answer questions until mastery is demonstrated.

---

## Frontend (`client/`)

**Stack:** React 19, TypeScript, Vite, Tailwind CSS

### Pages / Views

| View | Description |
|---|---|
| Home / Upload | User uploads a textbook PDF |
| Loading | Progress indicator while the backend parses the PDF |
| Topic Selection | Lists chapters/sections extracted from the PDF; user picks one to review |
| Review Session | Interactive chat-style interface where the AI asks questions and evaluates user responses |
| Session Summary | Shows mastered vs. struggling topics at the end of a session |

### Components

- **PdfUpload** — drag-and-drop or file picker for PDF input
- **TopicList** — scrollable list of extracted chapters/sections
- **ChatWindow** — scrollable message thread for the review session
- **MessageBubble** — renders individual AI or user messages; supports markdown
- **ProgressIndicator** — shows parsing status
- **MasteryBadge** — visual indicator of understanding level per topic

### State & Data Flow

- PDF is uploaded to the backend parse endpoint (multipart/form-data)
- Extracted topic list is fetched and displayed for selection
- User selects a topic; the backend loads that chapter's full text into Claude's context
- Messages are sent to the backend AI endpoint and streamed back
- Session state (messages, current topic, mastery status) lives in React state / context

### Non-Goals (Frontend)

- No user authentication in initial scope
- No persistent history across browser sessions (initial scope)

---

## Backend (`server/`)

**Stack:** Node.js, Express, TypeScript

### 3-Phase Architecture

The backend is divided into three distinct jobs that run in sequence:

---

#### Job 1 — PDF Upload & Parse

Triggered when the user uploads a PDF. Responsible for all content extraction and structuring.

**Endpoint:** `POST /api/upload`

**What it does:**
- Accepts the PDF file via `multer` (multipart/form-data)
- Extracts all text from the PDF page by page using `pdf-parse`
- Detects chapter and section boundaries using heading patterns (e.g. "Chapter 3", "3.1 Kinematics")
- Splits the full text into topic chunks — one chunk per chapter/section
- Stores the structured chunks in memory under a new session ID
- Returns the session ID and the list of topics to the client

**Output:** `{ sessionId, topics: [{ id, title, chapter }] }`

---

#### Job 2 — Topic Selection & Context Load

Triggered when the user selects a topic to review. Responsible for preparing the AI's context.

**Endpoint:** `POST /api/session/start`

**What it does:**
- Looks up the selected topic's full text from the in-memory session store
- Constructs a system prompt containing:
  - The Socratic tutor persona and instructions
  - The full text of the selected chapter/section as reference material
- Initializes a new review session (empty message history) keyed by session ID + topic ID
- Returns confirmation that the session is ready

**Why topic-scoped context instead of RAG:**
A single textbook chapter is typically 5,000–20,000 tokens — well within Claude's 200k context window. Since the user already picks a specific topic before the session starts, the relevant content is already known. Loading the full chapter into context is simpler, more reliable, and requires no embeddings or vector search.

---

#### Job 3 — AI Review Session

Handles the live Socratic session. Stateful per active review.

**Endpoints:**
- `POST /api/session/message` — receives a user message, appends to history, calls Claude, streams response back
- `GET /api/health` — health check

**What it does:**
- Appends each user message to the conversation history
- Sends the full history (with chapter context in the system prompt) to Claude via the Anthropic SDK
- Streams Claude's response back to the client chunk by chunk
- Claude operates under a Socratic tutor system prompt:
  - Ask the user to explain concepts in their own words
  - Follow up with examples, edge cases, or deeper questions
  - Assess understanding and decide when mastery is reached
  - Never just give the answer — guide the user to it
- When mastery is reached, Claude signals the session as complete

---

### API Endpoints Summary

| Method | Route | Job | Description |
|---|---|---|---|
| `POST` | `/api/upload` | Job 1 | Upload PDF, parse content, return session ID + topic list |
| `POST` | `/api/session/start` | Job 2 | Select a topic, load chapter context, initialize review session |
| `POST` | `/api/session/message` | Job 3 | Send a user message, get streamed AI response |
| `GET` | `/api/health` | — | Health check |

### Data Models

```ts
// Job 1 output — stored in memory
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
  content: string; // full extracted text for this chapter/section
}

// Job 2 output — stored in memory
interface ReviewSession {
  sessionId: string;
  topicId: string;
  systemPrompt: string; // Socratic persona + full chapter text
  messages: Message[];
  masteryReached: boolean;
}

// Job 3
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
- No vector embeddings or RAG — topic-scoped context is sufficient

---

## Out of Scope (v1)

- User accounts and persistent history
- Scanned PDF / image / video content parsing
- Course website scraping
- Mobile app
- Multi-user / collaborative sessions
