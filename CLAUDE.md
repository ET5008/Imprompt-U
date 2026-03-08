# Imprompt-U — Claude Code Context

## Project Overview

**Imprompt-U** is an AI-powered Socratic tutoring web app. Students upload a PDF textbook, select a chapter, and engage in a guided Q&A session where Claude acts as a Socratic tutor — asking open-ended questions to surface gaps in understanding without directly giving answers. The app tracks mastery percentage in real time and ends sessions when the student demonstrates full understanding.

---

## Tech Stack

### Frontend (`client/`)
- **React 19.2** + **TypeScript**
- **Vite 7.2** (dev server on port 5173, proxies `/api` to port 3000)
- **Tailwind CSS 4.1** (via `@tailwindcss/vite` plugin)
- **Framer Motion 12.35** (phase transitions, animations)
- **React Dropzone 15** (PDF drag-and-drop)
- **Vitest 4** (unit testing)

### Backend (`server/`)
- **Node.js + Express 4.22** (port 3000)
- **TypeScript 5.4** (compiled to CommonJS)
- **Anthropic SDK 0.78** (`claude-sonnet-4-6` model)
- **Supabase 2.98** (PostgreSQL + Object Storage)
- **pdf-parse 2.4** (text extraction)
- **Multer 2.1** (multipart file uploads)

---

## Directory Structure

```
Imprompt-U/
├── client/
│   └── src/
│       ├── api/client.ts           # All fetch-based API calls
│       ├── context/AppContext.tsx  # Global state (useReducer)
│       ├── hooks/
│       │   ├── useChatSession.ts   # Upload + session + messaging logic
│       │   ├── usePimpyState.ts    # Mascot emotion state
│       │   └── useVoiceInput.ts    # Voice-to-text
│       ├── components/
│       │   ├── chapters/           # ChapterSelection.tsx
│       │   ├── chat/               # ChatWindow, InputBar, MessageBubble, VoiceButton
│       │   ├── layout/             # Sidebar, SidebarTrigger, sidebarTimer
│       │   ├── pimpy/              # Pimpy.tsx (animated mascot)
│       │   ├── ui/                 # Button, Card, ThinkingDots
│       │   └── upload/             # UploadZone, FileList, FileChip
│       ├── types/index.ts
│       └── App.tsx                 # Phase-based routing (upload → chapters → chat → summary)
│
├── server/
│   └── src/
│       ├── routes/
│       │   ├── upload.ts           # PDF parsing & topic extraction (~690 lines)
│       │   ├── session.ts          # Socratic Q&A with SSE streaming (~267 lines)
│       │   ├── sessionStartup.ts   # Review session initialization (~73 lines)
│       │   ├── health.ts           # GET /api/health
│       │   └── index.ts            # Route aggregation
│       ├── lib/supabase.ts         # Supabase client (service role)
│       ├── middleware/errorHandler.ts
│       ├── app.ts                  # Express setup (CORS, JSON)
│       ├── index.ts                # Server entry point
│       └── store.ts                # Legacy in-memory store (unused)
│
├── SCOPE.md                        # Project specification
└── CLAUDE.md                       # This file
```

---

## Database Schema (Supabase / PostgreSQL)

```sql
textbooks {
  id            uuid PRIMARY KEY
  session_id    uuid
  filename      text
  storage_path  text        -- Path in Supabase "textbooks" bucket
  page_count    integer
  created_at    timestamp
}

topics {
  id            uuid PRIMARY KEY
  textbook_id   uuid REFERENCES textbooks(id)
  topic_order   integer     -- Ordering within textbook
  title         text        -- Chapter title
  chapter       text        -- e.g. "Chapter 1"
  content       text        -- Full extracted text
  created_at    timestamp
}

review_sessions {
  id              uuid PRIMARY KEY
  topic_id        uuid REFERENCES topics(id)
  system_prompt   text      -- Socratic persona + chapter context
  chapter_content text      -- Trimmed chapter text for AI context
  total_concepts  integer   -- Estimated concept count
  mastery_percent integer   -- 0-100
  mastery_reached boolean
  created_at      timestamp
}

messages {
  id                uuid PRIMARY KEY
  review_session_id uuid REFERENCES review_sessions(id)
  role              text    -- 'user' | 'assistant'
  content           text
  created_at        timestamp
}
```

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/upload` | Upload PDF, parse text, extract topics, store in DB |
| POST | `/api/upload/from-db` | Re-parse existing textbook from Supabase storage |
| POST | `/api/session/start` | Initialize review session for a selected topic |
| POST | `/api/session/message` | Send user message; streams AI response via SSE |
| GET  | `/api/session/mastery` | Get mastery stats (`?reviewKey=...`) |
| GET  | `/api/health` | Health check |

**Streaming:** `/api/session/message` returns Server-Sent Events (SSE). Client reads body as a stream and parses JSON chunks.

---

## Environment Variables (Server)

```bash
PORT=3000
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-6
SUPABASE_URL=https://djsqdkwadcnvompnnktx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_PDF_BUCKET=textbooks

# Optional tuning
MAX_CHAT_TURNS=10
MAX_GAP_USER_MESSAGES=6
MAX_GAP_CONTEXT_CHARS=8000
MAX_CHAPTER_CONTEXT_CHARS=24000
ANTHROPIC_GAP_MODEL=claude-sonnet-4-6   # defaults to ANTHROPIC_MODEL
```

Client uses Vite proxy — no `.env` needed for the client.

---

## Development Workflow

```bash
# Terminal 1 — Backend
cd server
npm run dev          # tsx watch src/index.ts → port 3000

# Terminal 2 — Frontend
cd client
npm run dev          # vite → port 5173, proxies /api to :3000
```

Build for production:
```bash
cd server && npm run build   # tsc → dist/
cd client && npm run build   # tsc + vite build → dist/
```

---

## App Phases (App.tsx)

The UI renders based on a phase state in `AppContext`:

1. **`upload`** — UploadZone + FileList; user drags PDF
2. **`chapters`** — ChapterSelection; user picks topic
3. **`chat`** — ChatWindow + InputBar; Socratic session
4. **`summary`** — Final mastery score + session wrap-up

---

## Key Architectural Decisions

### Streaming (SSE)
- Server pushes chunks via `res.write()` as newline-delimited JSON
- Client reads response body as `ReadableStream`, buffers, parses lines
- Allows real-time token-by-token display

### Context Window Strategy
- Full chapter content injected into Claude's system prompt per session
- No RAG/embeddings — simpler and more reliable for chapter-length content
- Trimmed to `MAX_CHAPTER_CONTEXT_CHARS` (~24k chars) if needed

### Mastery Algorithm
- After each user turn, a second Claude call analyzes remaining knowledge gaps
- Mastery % = `(total_concepts - remaining_gaps) / total_concepts * 100`
- Capped at 95% until Claude emits `[MASTERY_REACHED]` token → jumps to 100%
- Fallback: linear progression by turn count if gap analysis fails

### PDF Parsing Strategy (`server/src/routes/upload.ts`)
1. Extract text page-by-page using `pdf-parse`
2. Detect printed page numbers to compute PDF-to-book page offset
3. Score candidate TOC pages; pick highest-scoring
4. Parse TOC entries via regex (dotted lines or spaced formats)
5. Split content into topic chunks by chapter boundaries
6. Insert textbook row, then topics in batches of 25

### State Management
- `AppContext.tsx` uses React `useReducer` for all global state
- State includes: phase, sessionId, topics, selectedTopic, reviewKey, messages, masteryPercent, sidebarOpen, theme

---

## Current In-Progress Work

Last commit: `95e94c0 — "need to implement subchapter"`

The subchapter feature is partially implemented. When working on it, check:
- `server/src/routes/upload.ts` — topic/chapter splitting logic
- `client/src/components/chapters/ChapterSelection.tsx` — chapter list UI
- `client/src/types/index.ts` — Topic type definition

---

## Important Files Quick Reference

| Purpose | File |
|---------|------|
| Global state | `client/src/context/AppContext.tsx` |
| All API calls | `client/src/api/client.ts` |
| Chat + upload logic | `client/src/hooks/useChatSession.ts` |
| Main routing | `client/src/App.tsx` |
| PDF parsing | `server/src/routes/upload.ts` |
| Socratic Q&A + streaming | `server/src/routes/session.ts` |
| Session init | `server/src/routes/sessionStartup.ts` |
| Supabase client | `server/src/lib/supabase.ts` |
| TypeScript types | `client/src/types/index.ts` |

---

## Notes

- The `store.ts` file is a legacy in-memory store — **not used**, all data is in Supabase
- Supabase uses **service role key** on the server (full DB access, never expose to client)
- PDF uploads are temporarily stored in `/tmp`, then uploaded to Supabase Storage, then deleted
- Sidebar shows past sessions (read-only playback)
- Idle timer: 5 minutes of inactivity returns to home
- Two themes: **ice-cream** (light, sketch-style) and **dark**
- Mascot "Pimpy" has 6 emotion states tied to app phase and silence duration
