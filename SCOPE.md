# Imprompt-U — Project Scope

## Overview

Imprompt-U is an AI-powered study tool that scrapes a course website, extracts learning materials (textbooks, classwork, homework), and conducts an interactive Socratic review session with the user. The AI prompts the user to explain topics, work through examples, and answer questions until mastery is demonstrated.

---

## Frontend (`client/`)

**Stack:** React 19, TypeScript, Vite, Tailwind CSS

### Pages / Views

| View | Description |
|---|---|
| Home / Setup | User pastes a course website URL and submits it for scraping |
| Loading | Progress indicator while the backend scrapes and indexes content |
| Topic Selection | Lists discovered topics (from textbooks, classwork, homework); user picks one to review |
| Review Session | Interactive chat-style interface where the AI asks questions and evaluates user responses |
| Session Summary | Shows mastered vs. struggling topics at the end of a session |

### Components

- **UrlInput** — text field + submit button for the course URL
- **TopicList** — scrollable list of scraped topics with category badges (Textbook / Classwork / Homework)
- **ChatWindow** — scrollable message thread for the review session
- **MessageBubble** — renders individual AI or user messages; supports markdown
- **ProgressIndicator** — shows scraping/indexing status
- **MasteryBadge** — visual indicator of understanding level per topic

### State & Data Flow

- URL is submitted to the backend scrape endpoint
- Scraped topic list is fetched and displayed for selection
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
| `POST` | `/api/scrape` | Accepts a course URL, scrapes content, indexes it, returns a session ID and topic list |
| `GET` | `/api/topics/:sessionId` | Returns the list of discovered topics for a session |
| `POST` | `/api/session/start` | Starts a review session for a given topic and session ID |
| `POST` | `/api/session/message` | Sends a user message; returns the AI's next prompt or evaluation |
| `GET` | `/api/health` | Health check |

### Core Services

**Scraper Service**
- Accepts a course website URL
- Crawls linked pages to find syllabus, homework, textbook references, and classwork materials
- Extracts and cleans text content
- Organizes content by category: Textbook, Classwork, Homework

**Memory / Storage Service**
- Stores scraped content in-memory per session (keyed by session ID)
- Chunks and indexes content for retrieval during review (RAG pattern)
- Sessions expire after inactivity (TTL-based cleanup)

**AI Service (Claude)**
- Uses the Anthropic SDK to call Claude
- Maintains conversation history per session
- System prompt instructs Claude to act as a Socratic tutor:
  - Ask the user to explain a concept in their own words
  - Follow up with examples, edge cases, or deeper questions
  - Assess understanding and decide when mastery is reached
  - Never just give the answer — guide the user to it
- Streams responses back to the client

### Data Models

```ts
// Session stored in memory
interface Session {
  id: string;
  url: string;
  topics: Topic[];
  createdAt: Date;
}

interface Topic {
  id: string;
  title: string;
  category: 'textbook' | 'classwork' | 'homework';
  content: string; // extracted text
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
- No support for authenticated/paywalled course sites
- No PDF parsing in initial scope (text-only scraping)

---

## Out of Scope (v1)

- User accounts and persistent history
- PDF / image / video content parsing
- Support for LMS platforms requiring login (Canvas, Blackboard, etc.)
- Mobile app
- Multi-user / collaborative sessions
