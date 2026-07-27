# ThoughtStack

NotebookLM-style RAG app: isolated notebooks, multi-source ingest, an advanced query pipeline (step-back, rewrite, sub-queries, HyDE, multi-vector search, RRF, grade-and-retry), and host/guest podcast generation via ElevenLabs.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js (App Router) + Tailwind + Clerk |
| Backend | Express + TypeScript |
| DB | Prisma + Neon (serverless Postgres) |
| Vector DB | Qdrant Cloud |
| Queue | BullMQ + Redis |
| RAG | LangChain.js + OpenAI embeddings / `gpt-4o-mini` |

Apps are **separate packages** (no monorepo tooling). Install and run each independently.

```
ThoughtStack/
├── frontend/           # Next.js UI (Clerk)
├── backend/            # Express API + BullMQ worker
├── Caddyfile           # HTTPS reverse proxy for the API
├── docker-compose.yml  # redis + api + worker + caddy
└── README.md
```


## Prerequisites

- Node.js 20+
- Docker Desktop (for Redis)
- [Neon](https://neon.tech) project (Postgres connection strings)
- [Qdrant Cloud](https://cloud.qdrant.io) cluster (URL + API key)
- [Clerk](https://clerk.com) application (publishable + secret keys)
- OpenAI API key
- [ElevenLabs](https://elevenlabs.io) API key (podcast TTS)

## Quick start

### 1. Infra (Redis)

From the repo root:

```bash
docker compose up -d
```

- Redis: `localhost:6379`

Neon and Qdrant are cloud-only — no Postgres or Qdrant containers.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill DATABASE_URL, DIRECT_URL, Clerk keys, OPENAI_API_KEY, etc.
npm install --legacy-peer-deps
npx prisma migrate dev
npm run dev
```

API defaults to **http://localhost:4000**.

In a second terminal, start the worker (source indexing + podcast generation):

```bash
cd backend
npm run worker
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | API with `tsx watch` |
| `npm run worker` | BullMQ `source-index` + `podcast-generate` worker |
| `npm run prisma:migrate` | Run migrations against Neon |
| `npm run prisma:generate` | Regenerate Prisma client |

Health check: `GET /health` (API + Neon + Qdrant).

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_API_URL
npm install
npm run dev
```

App defaults to **http://localhost:3000**.

- `/` — landing + Clerk sign-in/up
- `/sign-in`, `/sign-up` — Clerk components
- `/notebooks` — notebook list (protected)
- `/notebooks/[id]` — workspace: sources + Studio (podcasts) + chat + source viewers

`NEXT_PUBLIC_API_URL` should point at the Express API (e.g. `http://localhost:4000`).

## Env vars

Copy the example files and fill in real values:

- `backend/.env.example` → `backend/.env`
- `frontend/.env.example` → `frontend/.env.local`

### `backend/.env`

| Variable | Notes |
| --- | --- |
| `PORT` | API port (default `4000`) |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct** URL for Prisma migrate |
| `REDIS_URL` | `redis://localhost:6379` |
| `QDRANT_URL` | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | Qdrant Cloud API key |
| `OPENAI_API_KEY` | Embeddings + LLM |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Backend JWT verify |
| `CORS_ORIGIN` | Frontend origin (`http://localhost:3000`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name (default `sources`) |
| `ELEVENLABS_API_KEY` | Podcast TTS (required at generation time) |
| `ELEVENLABS_HOST_VOICE_ID` | Male host voice (default Adam) |
| `ELEVENLABS_GUEST_VOICE_ID` | Female guest voice (default Sarah) |

### `frontend/.env.local`

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret (Next middleware) |
| `NEXT_PUBLIC_API_URL` | Express base URL |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |

## Architecture

```mermaid
flowchart TB
  subgraph client [Frontend]
    UI[Next.js notebook UI]
    ClerkFE[Clerk Auth]
  end

  subgraph api [Backend]
    REST[Express REST API]
    Worker[BullMQ Worker]
    Ingest[Extract → Chunk → Embed]
    QueryPipe[Advanced query pipeline]
  end

  subgraph data [Infra]
    Neon[(Neon Postgres)]
    Redis[(Redis)]
    Qdrant[(Qdrant)]
    OpenAI[OpenAI API]
    ElevenLabs[ElevenLabs]
    Supabase[(Supabase Storage)]
  end

  UI --> ClerkFE
  UI -->|Bearer JWT| REST
  REST --> Neon
  REST -->|enqueue index / podcast| Redis
  Worker --> Redis
  Worker --> Ingest
  Worker -->|podcast script + TTS| OpenAI
  Worker --> ElevenLabs
  Worker --> Supabase
  Ingest --> Neon
  Ingest --> Qdrant
  Ingest --> OpenAI
  Ingest --> Supabase
  REST --> QueryPipe
  QueryPipe --> Qdrant
  QueryPipe --> OpenAI
  QueryPipe --> Neon
```

**Isolation:** every Qdrant point stores `notebookId` + `sourceId`; searches always filter by `notebookId`.

**Three pipelines:**

1. **Ingest** — document → extract → chunk → embed → Qdrant (+ Chunk rows in Neon)
2. **Query** — plan/rewrite/sub-queries + HyDE → multi-vector search → RRF (top 5) → grounded answer → grade/retry (max 3)
3. **Podcast** — all READY sources → LLM host/guest script (≤ ~5 min) → ElevenLabs Text-to-Dialogue → MP3 in Supabase

## Podcast generation

From a notebook with at least one **Ready** source, use the **Studio** panel:

1. Click **Generate podcast** (uses all READY sources; host = male, guest = female).
2. Worker writes a ~4–5 minute dialogue with OpenAI, then synthesizes audio with ElevenLabs (batched ≤2k chars / request).
3. When status is **Ready**, play or download the MP3; expand **Script** to read turns.

Limits: max **5 podcasts** per notebook; one generation in flight per notebook; spoken length capped at **~5 minutes**.

## Submission limits

| Limit | Value |
| --- | --- |
| Max upload size | **20 MB** (PDF / TEXT / VTT) |
| Max sources per notebook | **25** |
| Max podcasts per notebook | **5** |
| Max podcast duration | **~5 minutes** |
| Source write rate | 30 / minute / client |
| Query rate | 10 / minute / client |
| Podcast write rate | 5 / minute / client |

Oversized files are rejected in the UI before upload and by Multer on the API (`413` with a clear error).

## Demo script

Use this walkthrough for a grading / assignment demo (about 5–8 minutes).

1. **Start infra + apps**
   - `docker compose up -d`
   - Backend: `npm run dev` and `npm run worker`
   - Frontend: `npm run dev`
2. **Sign in** at http://localhost:3000 with Clerk.
3. **Create a notebook** on `/notebooks` (e.g. “Demo notes”).
4. **Add sources** in the workspace:
   - Upload a `.txt` or `.pdf` (under 20 MB)
   - Optionally add a website URL and/or YouTube URL with captions
   - Watch status badges: Uploading → Indexing → **Ready** (polls every ~2.5s)
5. **Ask a question** once at least one source is Ready.
   - The Ask button stays disabled until a Ready source exists.
   - Wait for the graded answer (may take several seconds — multi-step RAG).
6. **Citations**
   - Every assistant answer shows citation chips under the message.
   - Click a chip → source viewer opens at the relevant locus (PDF page, YouTube timestamp, text highlight, website preview).
7. **Generate a podcast** (optional)
   - In **Studio**, click **Generate podcast** once sources are Ready.
   - Wait for Queued → Generating → Ready, then play / download the MP3.
8. **Failure / retry**
   - If indexing fails, the source shows an error and a **Retry** action.
9. **Cleanup**
   - Delete a source, podcast, or notebook via the confirm dialog.

Optional talking points while demos run:

- Query path uses step-back + rewrite + sub-queries (one structured LLM call), HyDE, parallel dense search, RRF fusion, grounded answer, grader score /10 with up to 3 attempts.
- Chat shows grade + attempt count under assistant messages for debugging.

## Deploy API with HTTPS (Caddy)

Vercel (HTTPS) cannot call a plain `http://IP:4000` API (mixed content). Use Caddy in Compose for Let’s Encrypt TLS.

1. Point a DNS **A** record (e.g. `api.yourdomain.com`) at your VPS. Open ports **80** and **443**.
2. On the server, create root `.env` (see `.env.example`):

```bash
cp .env.example .env
# API_DOMAIN=api.yourdomain.com
# ACME_EMAIL=you@example.com
```

3. Set `backend/.env` with production values, especially:

```env
CORS_ORIGIN=https://thought-stack-ai.vercel.app
```

4. Start the stack **with the HTTPS profile** (enables Caddy):

```bash
docker compose pull
docker compose --profile https up -d
docker compose logs -f caddy
```

5. Check `https://api.yourdomain.com/health`.

6. On Vercel, set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` and redeploy the frontend.

## Notes

- Source files (PDF / TEXT / VTT / YouTube transcripts) and generated podcast MP3s are stored in Supabase Storage.
- Install backend deps with `--legacy-peer-deps` if npm reports LangChain optional-peer conflicts (an `.npmrc` is included).
- Run `npx prisma migrate dev` only after `DATABASE_URL` / `DIRECT_URL` point at a real Neon database.
- Frontend `README.md` is the stock Next.js file; use this root README for product setup.
- Production HTTPS: `docker compose --profile https up -d` (needs root `.env` with `API_DOMAIN` + `ACME_EMAIL`).
