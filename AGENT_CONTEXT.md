# Crime OS AI — Agent Context & Developer Guide

> **Purpose:** Drop this file as context when starting a new AI agent session on this repo.
> It covers architecture, every service, every `.env` file, and exact startup commands.
> The agent should read this before touching any code.

---

## 1. What This Project Is

**Crime OS** is an AI-powered internal investigation management platform for the Gujarat Police (India).
It digitises the full criminal investigation lifecycle:

```
Complaint Filed → AI Processing → SHO Review → FIR Generated
→ IO Assigned → Investigation Workspace → Charge Sheet → Case Closed
```

**Users:** Police officers only (SHO, IO, Admin). Citizens register complaints; officers work cases.

**Live frontend:** https://crimeos-lemon.vercel.app  
**Repo:** https://github.com/Siddh-2006/Crime_OS_AI  
**Active branch:** `Siddh_local`

---

## 2. Repository Layout

```
Crime_OS_AI/
├── backend/                  ← Node.js + TypeScript REST API (port 5000)
├── frontend/                 ← Next.js 16 + React 18 (port 3000)
├── services/
│   ├── complaint_intelligence/  ← Python FastAPI — OCR, vision, LLM fusion (port 8001)
│   ├── florence_service/        ← Python FastAPI — Florence-2 / Gemini Vision (port 8002)
│   ├── io-recommendation/       ← Python FastAPI — Officer matching via Qdrant (port 8003)
│   ├── legal_agent/             ← Python FastAPI — RAG over BNS/BNSS law corpus (port 8004)
│   └── prompt_compression/      ← Python FastAPI — LLMLingua-2 token compression (port 8005)
├── docker-compose.yml        ← MongoDB, Redis, Qdrant containers
├── .gitignore
└── AGENT_CONTEXT.md          ← This file
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js 20, Express 4, TypeScript 5.4, Mongoose 8, BullMQ 5 |
| Frontend | Next.js 16 (App Router), React 18, MUI 9, Tailwind CSS 3, Dexie.js (offline) |
| Primary DB | MongoDB 7 (Mongoose ODM) |
| Queue / Cache | Redis 7 + BullMQ |
| Vector DB | Qdrant v1.9.1 |
| File Storage | Cloudinary |
| LLM (primary) | Ollama (local) — `gemma4:e4b` fast / `llama3.2:latest` deep |
| LLM (fallback) | Google Gemini 3.1 Flash-Lite (cloud) |
| Vision | Florence-2 local OR Gemini Vision API |
| OCR | PaddleOCR v3.x (local) OR Gemini Vision |
| Auth | JWT (access 15 min + refresh 7 days stored in Redis) |
| Email | Nodemailer SMTP + Gmail OAuth2 for department polling |
| Real-time | Socket.io `/chat` namespace (private case rooms) |

---

## 4. Infrastructure — Start These First

These three run via Docker. Start them before anything else.

```powershell
# From repo root
docker-compose up -d
```

This starts:
- **MongoDB** on `localhost:27017` (database: `crime_os` / `crime-os`)
- **Redis** on `localhost:6379`
- **Qdrant** on `localhost:6333` (HTTP) and `localhost:6334` (gRPC)

Verify:
```powershell
docker ps   # should show 3 containers: crime_os_mongodb, crime_os_redis, crime_os_qdrant
```

---

## 5. Backend (Node.js API — Port 5000)

### Location
```
backend/
├── src/
│   ├── app.ts           ← Express factory (routes, middleware)
│   ├── server.ts        ← Entry point — DB, Redis, Socket.io, BullMQ workers
│   ├── config/          ← env.ts, database.ts, redis.ts, bullmq.ts, cloudinary.ts, logger.ts
│   ├── common/          ← middlewares (authenticate, authorize, validate, rateLimiter)
│   ├── modules/         ← Feature modules (admin, auth, complaint, investigation, police…)
│   └── shared/          ← BullMQ workers, LLM clients, utils
```

### Setup & Start

```powershell
cd backend
npm install
npm run dev       # development with nodemon hot-reload
# OR
npm run build ; npm start   # production
```

### Environment File

Create `backend/.env` (copy from `backend/.env.example` and fill in values):

```env
# ── Server ──────────────────────────────────────────────────────────────────
NODE_ENV=development
PORT=5000

# ── MongoDB ─────────────────────────────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/crime_os

# ── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ── JWT (generate strong random strings) ────────────────────────────────────
JWT_ACCESS_SECRET=your_64_char_random_secret_here
JWT_REFRESH_SECRET=your_64_char_random_secret_here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
JWT_REFRESH_EXPIRY_SECONDS=604800

# ── Cookie ───────────────────────────────────────────────────────────────────
COOKIE_SECRET=your_cookie_secret_here

# ── CORS ─────────────────────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:3000

# ── Email (Gmail SMTP — create an App Password at myaccount.google.com) ─────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
EMAIL_FROM=Crime OS Gujarat Police <noreply@gujaratpolice.gov.in>

# ── BullMQ (same Redis as above) ─────────────────────────────────────────────
BULL_REDIS_HOST=localhost
BULL_REDIS_PORT=6379
BULL_REDIS_PASSWORD=

# ── Cloudinary (sign up at cloudinary.com — free tier works) ────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Python AI Microservice URLs ──────────────────────────────────────────────
COMPLAINT_INTELLIGENCE_URL=http://localhost:8001
LEGAL_AGENT_URL=http://localhost:8004
IO_RECOMMENDATION_URL=http://localhost:8003
FLORENCE_SERVICE_URL=http://localhost:8002
TRANSLATION_SERVICE_URL=http://localhost:8010
TRANSLATION_TIMEOUT_MS=30000

# ── Prompt Compression (optional — can disable) ──────────────────────────────
PROMPT_COMPRESSION_ENABLED=false
PROMPT_COMPRESSION_URL=http://localhost:8005

# ── Ollama (local LLM — install from ollama.com) ────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_NUM_CTX=32768
OLLAMA_REQUIRED_MODELS=gemma4:e4b,llama3.2:latest

# ── Gemini (cloud fallback — get key at aistudio.google.com/apikey) ─────────
# Comma-separate multiple keys for round-robin rotation
GEMINI_API_KEY=AIzaSy_your_key_here
GEMINI_MODEL=gemini-3.1-flash-lite

# ── SightEngine deepfake detection (sightengine.com) ────────────────────────
SIGHTENGINE_API_USER=your_user
SIGHTENGINE_API_KEY=your_key
SIGHTENGINE_TIMEOUT_MS=30000
SIGHTENGINE_ENABLE_DEEPFAKE_CHECK=true

# ── Gmail OAuth2 (for department request email polling) ──────────────────────
# GCP Console → APIs & Services → Credentials → OAuth 2.0 Client ID
# Scopes needed: gmail.readonly, gmail.modify, gmail.metadata
GMAIL_CLIENT_ID=your_client_id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-your_secret
GMAIL_REFRESH_TOKEN=1//your_refresh_token
GMAIL_POLICE_EMAIL=your_police_gmail@gmail.com
GMAIL_POLL_INTERVAL_MS=60000

# ── BullMQ job timeouts ──────────────────────────────────────────────────────
ANALYSIS_JOB_LOCK_DURATION_MS=1500000
CASE_DIARY_JOB_LOCK_DURATION_MS=300000
```

### BullMQ Workers (auto-start with backend)

The backend automatically starts these background workers on boot:

| Worker | Queue | What it does |
|---|---|---|
| `EmailWorker` | `email` | Sends OTP / welcome / FIR notification emails |
| `FirWorker` | `fir` | Generates FIR PDF (English + Gujarati-English) → uploads to Cloudinary |
| `AnalysisWorker` | `analysis` | Runs the 7-step AI investigation orchestrator |
| `GmailPollWorker` | `gmail-poll` | Polls police Gmail inbox every 60s for department reply emails |
| `CaseDiaryWorker` | `case-diary` | Generates Case Diary PDF → uploads to Cloudinary |
| `CustodyTimerWorker` | `custody-timer` | Fires BNSS §57 24-hour custody deadline alerts |

---

## 6. Frontend (Next.js — Port 3000)

### Location
```
frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/          ← Login, register, verify-email, forgot/reset-password
│   │   ├── (dashboard)/     ← Officer dashboard + complaint/investigation workspace
│   │   ├── admin/           ← Admin panel
│   │   ├── citizen-response/ ← Token-based citizen info response
│   │   └── verify-custody/  ← QR scan for physical evidence
│   ├── components/          ← Shared UI components
│   ├── context/             ← Auth, Language, Theme providers
│   ├── hooks/               ← useAuth, useSync, useToast
│   └── lib/
│       ├── axios.ts         ← Configured API client with JWT + offline fallback
│       ├── offline/         ← Dexie.js IndexedDB cache, BullMQ outbox, SyncManager
│       └── constants.ts     ← API route constants
```

### Setup & Start

```powershell
cd frontend
npm install
npm run dev    # development on port 3000
```

### Environment File

Create `frontend/.env.local`:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1

# Cloudinary (for direct browser uploads — must match backend)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
```

---

## 7. Python Service: Complaint Intelligence (Port 8001)

This is the main AI pipeline. It handles evidence ingestion, OCR, vision captioning, and LLM case understanding fusion.

### Location
```
services/complaint_intelligence/
├── app/
│   ├── main.py              ← FastAPI app entry point
│   ├── core/config.py       ← Reads .env via pydantic-settings
│   ├── case_understanding/  ← LLM fusion engine + incremental orchestrator
│   ├── ocr_worker/          ← PaddleOCR v3 + Gemini OCR fallback
│   ├── image_worker/        ← Image metadata + Florence captioning
│   ├── pdf_worker/          ← PDF text extraction
│   ├── audio_worker/        ← Speech-to-text (Gemini STT)
│   └── queue/               ← Redis job queue + worker runner
```

### Setup & Start

```powershell
# From repo root — uses the shared root .venv
cd "d:\CRIME_OS_AI"
.\.venv\Scripts\Activate.ps1

cd services\complaint_intelligence
uvicorn app.main:app --reload --port 8001
```

### Environment File

Create `services/complaint_intelligence/.env`:

```env
# ── Application ────────────────────────────────────────────────────────────
APP_NAME="Crime OS Complaint Intelligence"
APP_VERSION="1.0.0"
APP_ENV=production        # production | development
DEBUG=false

# ── HTTP Server ─────────────────────────────────────────────────────────────
HOST=0.0.0.0
PORT=8001

# ── Redis (same instance as backend) ───────────────────────────────────────
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ── MongoDB (same instance as backend) ─────────────────────────────────────
MONGODB_URI=mongodb://127.0.0.1:27017/crime-os
MONGODB_DB=crime-os

# ── Logging ─────────────────────────────────────────────────────────────────
LOG_LEVEL=INFO            # DEBUG | INFO | WARNING | ERROR | CRITICAL
LOG_FORMAT=json           # json | text

# ── LLM Backend ─────────────────────────────────────────────────────────────
# Set LLM_BACKEND=gemini to bypass Ollama entirely (recommended for local dev without GPU)
# Set LLM_BACKEND=ollama to use local Ollama first, with Gemini as automatic fallback
LLM_BACKEND=gemini

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:9b
OLLAMA_TIMEOUT_SECONDS=120
OLLAMA_NUM_CTX=4096

# Gemini API key (get from aistudio.google.com/apikey)
GEMINI_API_KEY=AIzaSy_your_key_here
GEMINI_MODEL=gemini-3.1-flash-lite        # Main LLM model
GEMINI_STT_MODEL=gemini-2.5-flash-lite    # Audio speech-to-text model

# ── OCR Engine ───────────────────────────────────────────────────────────────
# paddle → local PaddleOCR v3 (requires paddlepaddle installed)
# gemini → Gemini Vision OCR (no local model needed — recommended for dev)
OCR_ENGINE=paddle

# ── Queue Settings ───────────────────────────────────────────────────────────
QUEUE_MAX_JOBS=10
QUEUE_JOB_TIMEOUT=300
QUEUE_MAX_TRIES=3

# ── Cloudinary (same credentials as backend) ────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

**Note:** This service also reads `backend/.env` automatically (via `pydantic-settings` multi-file config in `config.py`). Cloudinary and MongoDB credentials only need to be set in one place.

---

## 8. Python Service: Florence Vision (Port 8002)

Handles image captioning and detailed visual description. Can run locally with Florence-2 model (~450 MB download) or via Gemini Vision API.

### Setup & Start

```powershell
cd services\florence_service
# Uses root .venv — activate first if not already active
uvicorn app:app --reload --port 8002
# OR: python app.py
```

### Environment File

Create `services/florence_service/.env`:

```env
HOST=0.0.0.0
PORT=8002

# ── Vision Backend ───────────────────────────────────────────────────────────
# 'florence' → local Florence-2-base model (~450 MB, needs transformers + torch)
# 'gemini'   → Gemini Vision API (no download needed, recommended for dev)
VISION_BACKEND=gemini

# Required when VISION_BACKEND=gemini
GEMINI_API_KEY=AIzaSy_your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

**Note:** If using `VISION_BACKEND=florence`, the first run will download the Florence-2-base model from HuggingFace (~450 MB). Subsequent runs use the cached model. Requires `torch`, `transformers`, `einops` in the venv.

---

## 9. Python Service: IO Recommendation (Port 8003)

Recommends investigation officers for new cases based on past case similarity using vector embeddings stored in Qdrant.

### Setup & Start

```powershell
cd services\io-recommendation
uvicorn app.main:app --reload --port 8003
```

### Environment File

Create `services/io-recommendation/.env`:

```env
APP_NAME="Crime OS AI Recommendation Service"
APP_VERSION=1.0.0
LOG_LEVEL=INFO

# ── Qdrant ───────────────────────────────────────────────────────────────────
# Local development: leave QDRANT_API_KEY empty
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=crime_fir_embeddings

# ── Embedding Backend ────────────────────────────────────────────────────────
# 'gemini' → Gemini text-embedding-004 (recommended for dev — no local model)
# 'auto'   → tries BGE then llama.cpp (needs local model downloaded)
# 'nomic'  → forces llama.cpp nomic-embed-text-v2-moe
EMBEDDING_BACKEND=gemini

GEMINI_API_KEY=AIzaSy_your_key_here
GEMINI_EMBEDDING_MODEL=gemini-embedding-2

# Only needed when EMBEDDING_BACKEND=nomic or auto
LLAMA_CPP_URL=http://127.0.0.1:8005
EMBEDDING_MODEL=nomic-embed-text-v2-moe

# ── Recommendation Settings ──────────────────────────────────────────────────
SIMILARITY_THRESHOLD=0.6
```

---

## 10. Python Service: Legal Agent / RAG (Port 8004)

Semantic retrieval over the BNS, BNSS, BSA legal corpus and Gujarat Police SOPs stored in Qdrant. Used by the investigation orchestrator for legal section recommendations.

### Setup & Start

```powershell
cd services\legal_agent
uvicorn app.main:app --reload --port 8004
```

### Environment File

Create `services/legal_agent/.env`:

```env
# ── Qdrant ───────────────────────────────────────────────────────────────────
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=crime_os

# ── Embedding Backend ────────────────────────────────────────────────────────
# 'gemini' → Gemini text-embedding-004 (recommended)
# 'auto'   → BGE sentence-transformers → Nomic llama.cpp (development)
EMBEDDING_BACKEND=gemini

GEMINI_API_KEY=AIzaSy_your_key_here
GEMINI_EMBEDDING_MODEL=gemini-embedding-2

# Only needed when EMBEDDING_BACKEND=auto or nomic (llama.cpp embedding server)
LEGAL_AGENT_LLAMA_CPP_URL=http://127.0.0.1:8005
LEGAL_AGENT_EMBEDDING_MODEL=nomic-embed-text-v2-moe
LEGAL_AGENT_EMBEDDING_DIM=768
```

**Important:** For the legal agent to return results, the Qdrant `crime_os` collection must be populated with BNS/BNSS/BSA embeddings. Use the Admin panel → RAG Ingest endpoint to upload legal documents after first setup.

---

## 11. Python Shared Virtual Environment

All Python services share **one** virtualenv at the repo root:

```powershell
# Create (one time only)
python -m venv .venv

# Activate (every terminal session)
.\.venv\Scripts\Activate.ps1   # Windows PowerShell
# source .venv/bin/activate    # Linux / macOS

# Install dependencies for all services
pip install -r services\complaint_intelligence\requirements.txt
pip install -r services\florence_service\requirements.txt
pip install -r services\io-recommendation\requirements.txt
pip install -r services\legal_agent\requirements.txt
```

Key packages: `fastapi`, `uvicorn`, `pydantic-settings`, `motor` (async MongoDB), `qdrant-client`, `paddleocr` (v3.7+), `paddlepaddle`, `httpx`, `redis[asyncio]`, `google-generativeai`, `cloudinary`

---

## 12. Complete Startup Order

Run each in a **separate terminal**. Always activate the venv before Python services.

```powershell
# Terminal 1 — Infrastructure (Docker)
docker-compose up -d

# Terminal 2 — Backend Node.js API
cd backend ; npm run dev

# Terminal 3 — Frontend
cd frontend ; npm run dev

# Activate venv once, then open new terminals for each Python service
.\.venv\Scripts\Activate.ps1

# Terminal 4 — Complaint Intelligence
cd services\complaint_intelligence ; uvicorn app.main:app --reload --port 8001

# Terminal 5 — Florence Vision
cd services\florence_service ; uvicorn app:app --reload --port 8002

# Terminal 6 — IO Recommendation
cd services\io-recommendation ; uvicorn app.main:app --reload --port 8003

# Terminal 7 — Legal Agent (RAG)
cd services\legal_agent ; uvicorn app.main:app --reload --port 8004
```

### Health Check URLs

| Service | URL |
|---|---|
| Backend API | `http://localhost:5000/health` |
| Frontend | `http://localhost:3000` |
| Complaint Intelligence | `http://localhost:8001/health` |
| Florence Vision | `http://localhost:8002/health` |
| IO Recommendation | `http://localhost:8003/health` |
| Legal Agent | `http://localhost:8004/health` |
| MongoDB | `mongodb://localhost:27017` |
| Redis | `redis://localhost:6379` |
| Qdrant Dashboard | `http://localhost:6333/dashboard` |

---

## 13. Key API Routes

All backend routes are prefixed `/api/v1`.

| Prefix | Purpose |
|---|---|
| `/auth` | Citizen: register, verify-email, login, logout, refresh-token, forgot/reset-password |
| `/police` | Officer: login, me, profile update, logout |
| `/admin` | Admin: officer/station CRUD, departments CRUD, RAG ingest |
| `/complaints` | Complaint lifecycle: create, approve/reject, FIR, evidence, close |
| `/cases` | Full investigation workspace (analysis, diary, checklist, evidence, participants, graph…) |
| `/case-understanding` | AI-generated case intelligence from complaint pipeline |
| `/translation` | Text translation (English / Hindi / Gujarati) |
| `/physical-evidence` | Physical evidence custody chain (QR-tagged items) |
| `/citizen-request` | Token-based citizen info request response page |

---

## 14. Database Models (MongoDB Collections)

| Model | Collection | Key Purpose |
|---|---|---|
| `User` | `users` | Citizens who file complaints |
| `Officer` | `officers` | Police officers (SHO / IO) |
| `Admin` | `admins` | Platform administrators |
| `PoliceStation` | `policestations` | Station master data |
| `DepartmentRegistry` | `departmentregistries` | External departments for requests |
| `Complaint` | `complaints` | Core complaint + FIR + embedded evidence metadata |
| `Evidence` | `evidences` | Separate evidence collection with AES-256-GCM encryption |
| `CaseParticipant` | `caseparticipants` | Victims, suspects, accused, witnesses |
| `AnalysisSnapshot` | `analysissnapshots` | AI analysis results per run |
| `CaseChecklist` | `casechecklists` | AI-generated + manual investigation steps |
| `DiaryEntry` | `diaryentries` | Append-only audit log (immutable by design) |
| `CaseDiary` | `casediaries` | Official daily case diary with PDF |
| `DepartmentRequest` | `departmentrequests` | Formal requests to external departments |
| `RequestThread` | `requestthreads` | Email thread messages |
| `ArrestWarrant` | `arrestwarrants` | BNSS warrant lifecycle state machine |
| `ChargeSheet` | `chargesheets` | Final charge sheet document |
| `CaseRoomMessage` | `caseroommessages` | AES-256-GCM encrypted private officer chat |
| `CaseEntity` | `caseentities` | NLP-extracted entities (names, phone numbers, accounts) |

---

## 15. User Roles & Login Paths

| Role | Login URL | Created By | Access |
|---|---|---|---|
| `ADMIN` | `POST /api/v1/admin/login` | Seeded manually | Full system CRUD |
| `SHO` (Station House Officer) | `POST /api/v1/police/login` | Admin creates | Approve/reject complaints, assign IOs, generate FIR |
| `IO` (Investigation Officer) | `POST /api/v1/police/login` | Admin creates | Full investigation workspace |
| `USER` (Citizen) | `POST /api/v1/auth/login` | Self-register | File complaints, respond to requests |

To seed the first Admin account:
```powershell
cd backend ; npm run seed
```

---

## 16. Common Issues & Fixes

| Error | Cause | Fix |
|---|---|---|
| `Cannot read properties of null (reading 'xCoordinate')` | fontkit GPOS crash on NotoSansGujarati font | Already handled — `sanitizeGujaratiText()` in FirWorker + CaseDiaryWorker with English fallback |
| `PaddleOCR.predict() got an unexpected keyword argument 'cls'` | PaddleOCR v3 removed `cls` param from `ocr()` | Fixed in `ocr_worker/engine.py` — uses `predict()` with v3 output normalizer |
| `404 Not Found` on Gemini API | Model name `gemini-2.0-flash-lite` was shut down June 1 2026 | Use `gemini-3.1-flash-lite` in all `.env` files |
| Scores show 0 after offline→online | Stale Dexie cache stored the response envelope instead of payload | Fixed — axios interceptor uses `?? null`, Dexie v3 migration clears stale data |
| Evidence preview "file could not be found" | `findRaw()` in EvidencePanel couldn't match Python UUID to Node.js evidence ID | Fixed — 4-tier matching strategy + index-based fallback |
| Analysis blank after offline→online | No `window.online` listener to trigger refetch | Fixed — listeners added in `page.tsx` and `InvestigationWorkspace.tsx` |
| `PIL.UnidentifiedImageError` on PNG | Image bytes corrupt or wrong format reaching the worker | Validation happens at decode step; Florence still captions even if PIL fails |

---

## 17. Important Code Locations for Common Tasks

| Task | File |
|---|---|
| Add a new API route | `backend/src/app.ts` (mount) + new module under `src/modules/` |
| Modify AI analysis pipeline | `backend/src/modules/investigation/services/investigationOrchestrator.ts` |
| Change LLM prompts | `backend/src/modules/investigation/services/analysisPromptBuilder.ts` |
| Modify case diary PDF | `backend/src/shared/queue/CaseDiaryWorker.ts` |
| Modify FIR PDF | `backend/src/shared/queue/FirWorker.ts` |
| Change knowledge graph edges | `backend/src/modules/investigation/services/caseGraphService.ts` |
| Add offline cache for a new endpoint | `backend/src/lib/axios.ts` → `shouldUseOfflineFallback()` + cache key mapping |
| Modify Dexie schema | `frontend/src/lib/offline/db.ts` — bump version and add `.upgrade()` |
| Change analysis snapshot display | `frontend/src/app/(dashboard)/police/dashboard/complaints/[id]/components/AnalysisPanel.tsx` |
| Change evidence card display | `frontend/src/app/(dashboard)/police/dashboard/complaints/[id]/components/InvestigationWorkspace.tsx` → `EvidencePanel` |
| Modify complaint intelligence LLM | `services/complaint_intelligence/app/case_understanding/engine.py` |
| Change OCR engine | `services/complaint_intelligence/app/ocr_worker/engine.py` |

---

## 18. Security Notes for Agents

- **Never commit `.env` files** — they are in `.gitignore`. Only `.env.example` files are tracked.
- **`DiaryEntry` is append-only** — Mongoose pre-hooks throw errors on `updateOne`/`deleteOne`. Do not bypass this.
- **Evidence fields are AES-256-GCM encrypted** at rest via the `evidenceEncryptionPlugin` Mongoose plugin. Raw DB values will appear as `enc:<iv>:<ciphertext>:<tag>` strings.
- **Chat messages are AES-256-GCM encrypted** — `CaseRoomMessage.content` is always encrypted.
- **JWT secrets** must be at least 32 characters. Use `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` to generate.
- **Warrant status** is a strict state machine — transitions are enforced at the service layer. Do not update `ArrestWarrant.status` directly via DB.
