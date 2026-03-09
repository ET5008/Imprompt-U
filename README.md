# Imprompt-U

An AI-powered Socratic tutoring app. Upload a PDF textbook, select a chapter, and get quizzed by Claude — which asks open-ended questions to surface gaps in your understanding rather than just lecturing at you. Mastery is tracked in real time based on answer quality.

---

## How It Works

1. **Upload** a PDF textbook — the app extracts chapters automatically
2. **Select** a chapter to study
3. **Chat** with the Socratic tutor — it asks questions, scores your answers, and focuses on what you haven't demonstrated yet
4. **Complete** the session when you've shown reasonable understanding of the core concepts

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, TypeScript |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Database | Supabase (PostgreSQL + Object Storage) |
| PDF Parsing | pdf-parse |

---

## Project Structure

```
Imprompt-U/
├── client/       # React frontend (Vite, port 5173)
└── server/       # Express backend (port 3000)
```

See [CLAUDE.md](CLAUDE.md) for full architecture details, file map, DB schema, and API routes.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project
- An Anthropic API key

### Setup

**1. Clone and install**
```bash
git clone https://github.com/ET5008/Imprompt-U.git
cd Imprompt-U

cd server && npm install
cd ../client && npm install
```

**2. Configure the server**

Create `server/.env`:
```env
PORT=3000
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-sonnet-4-6
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_PDF_BUCKET=textbooks
```

**3. Run in development**
```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Supabase Schema

Run these in the Supabase SQL editor:

```sql
create table textbooks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  filename text,
  storage_path text,
  page_count integer,
  created_at timestamp default now()
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  textbook_id uuid references textbooks(id),
  topic_order integer,
  title text,
  chapter text,
  content text,
  created_at timestamp default now()
);

create table review_sessions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics(id),
  system_prompt text,
  chapter_content text,
  total_concepts integer default 0,
  mastery_percent integer default 0,
  mastery_reached boolean default false,
  created_at timestamp default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  review_session_id uuid references review_sessions(id),
  role text,
  content text,
  created_at timestamp default now()
);
```

Also create a storage bucket named `textbooks` in Supabase Storage.

---

## Build for Production

```bash
cd server && npm run build    # outputs to server/dist/
cd client && npm run build    # outputs to client/dist/
```
