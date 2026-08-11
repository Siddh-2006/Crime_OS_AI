# Crime OS — AI-Powered Police Investigation Management Platform

> Crime OS is a comprehensive digital platform built to assist police officers throughout the entire lifecycle of a criminal investigation — from complaint intake to charge sheet generation. It combines structured case management with deeply integrated AI to reduce manual effort, surface critical insights, and ensure nothing falls through the cracks.

For the technical architecture, component design, data flows, security model, and deployment topology, see [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md).

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [User Roles & Access](#2-user-roles--access)
3. [Functional Workflows](#3-functional-workflows)
   - [Complaint Filing — Multi-Modal Ingestion](#complaint-filing--multi-modal-ingestion)
   - [Automatic Background Processing](#automatic-background-processing)
   - [SHO Workflow](#sho-workflow)
   - [IO Workflow](#io-workflow)
   - [Case Closure & Vector Embedding](#case-closure--vector-embedding)
   - [Multi-Language Support](#multi-language-support)
4. [Tech Stack](#4-tech-stack)
5. [Dependencies & Requirements](#5-dependencies--requirements)
6. [Setup & Installation](#6-setup--installation)

---

## 1. Platform Overview

Crime OS is an internal police operations platform — there is no public-facing or citizen-facing side. Every user on the platform is a verified police officer. The system is designed to digitize and accelerate the investigative process, bringing AI assistance at every step so officers can focus on decision-making rather than paperwork.

The platform covers the full investigation lifecycle:

```
Complaint Filed → AI Analysis → SHO Review → FIR Generated → IO Assigned → Investigation → Charge Sheet → Case Closed
```

---

## 2. User Roles & Access

There are two officer roles on the platform:

| Role | Full Name | Primary Responsibility |
|---|---|---|
| **SHO** | Station House Officer | Reviews incoming complaints, confirms FIRs, assigns cases to IOs |
| **IO** | Investigating Officer | Conducts the full investigation of assigned cases |

Officer accounts are created exclusively by the **Admin**. When adding a new officer, the admin fills in all required details — name, badge number, contact information, station assignment, and role (SHO or IO). Officers cannot self-register. This ensures that only verified, credentialed personnel have access to the system.

---

## 3. Functional Workflows

### Complaint Filing — Multi-Modal Ingestion

Any officer (SHO or IO) can file a complaint on behalf of a complainant. Crime OS supports **Multi-Modal Complaint Ingestion** — meaning the complaint can be submitted in whatever form the information arrives, without forcing the officer to manually transcribe everything.

**Multi-Modal Complaint Ingestion** refers to the platform's ability to accept complaint information across multiple input formats simultaneously:

- **Manual entry** — The officer types in the complaint details directly into the structured form.
- **Image upload** — A photograph of a written complaint, handwritten statement, or any physical document can be uploaded. The system extracts all readable text automatically.
- **PDF upload** — A scanned or digital PDF of a complaint form is uploaded and its contents are parsed and populated into the case.
- **Audio upload** — A voice recording of the complainant's statement is uploaded and automatically transcribed into text.

For **evidence**, the same multi-modal support applies — images, audio, PDFs, documents, and video files can all be attached to a case.

The complaint form itself captures:

- Incident date, time, and location
- Crime category (from Gujarat Police classification)
- Short description and full detailed account
- All attached evidence files

This means an officer receiving a handwritten complaint, a scanned document, or a voice memo can file a complete case in minutes without manual re-entry.

---

### Automatic Background Processing

The moment a complaint is submitted, two processes begin working simultaneously without any action required from the officer:

1. **Evidence Intelligence** — Every uploaded file (image, audio, PDF, video) is processed automatically. Images are analyzed for objects, scenes, and embedded GPS data. Audio is transcribed to text with language detection. PDFs have their full text extracted. Video is processed for key content. All extracted information is attached to the respective evidence item and is immediately available when the officer opens the case.

2. **Case Analysis** — The complaint text and all evidence are analyzed together to produce a structured AI assessment of the case — identifying key entities, suggesting legal sections, recommending next steps, and generating a confidence score. This is ready and waiting by the time any officer opens the case.

Both of these run in the background and complete without interrupting the officer's workflow.

---

### SHO Workflow

#### Reviewing the Complaint

New complaints appear on the SHO's dashboard immediately after filing. The SHO can view the complete original complaint — every field entered, every file attached — exactly as it was submitted.

#### AI Case Analysis

Alongside the original complaint, the SHO sees a fully generated **AI analysis of the case**. This is not a simple summary — it is a structured investigation-level analysis that includes:

- A narrative explanation of what happened based on all available information
- Identified entities: people, locations, financial accounts, organizations mentioned in the complaint
- Applicable legal sections from the BNS/BNSS/BSA, retrieved from a legal knowledge base

#### Evidence Analysis

Each piece of evidence attached to the complaint is individually analyzed and a detailed breakdown is shown — extracted text, transcription, detected objects, GPS metadata, an AI-generated summary, and a classification of what the evidence represents. The SHO can review all of this before making any decisions on the case.

#### Missing Evidence Drafts

If the AI determines that key information or evidence is missing from the complaint, it automatically generates ready-to-send draft requests addressed to the complainant. These drafts are fully written — the IO only needs to review and click send. No manual drafting required and it will be emailed to the complainant.

#### Event Timeline

The SHO can view a **chronological timeline of events** related to the case — reconstructed by the AI from all complaint details and evidence. This gives an at-a-glance picture of when things happened, in what sequence, and what is known about each event.

#### FIR Generation & Confirmation

When the SHO is ready to formally register the case, they click **Generate FIR**. The platform produces a complete FIR document in the official Gujarat Police format:

- All key fields (district, station, FIR number, crime sections, dates, complainant details, accused details, stolen property, full FIR statement) are **automatically populated** from the case data
- All applicable **legal sections** are pre-filled based on the AI's analysis
- The document is presented as an **editable form** — the SHO can review and modify any field before confirming
- Once satisfied, the SHO clicks **Confirm FIR** and the official FIR is registered with a unique FIR number
- A **downloadable PDF** of the FIR is generated in both English and bilingual Gujarati-English formats, stored securely in the system

#### Assigning the Case to an IO

After the FIR is confirmed, the SHO assigns the case to an IO for investigation. The platform presents a **ranked list of suggested IOs** based on:

- Similarity between this case and cases the officer has previously handled
- The officer's area of specialization

The list is ordered in descending order of relevance, so the most suitable IO appears at the top. The SHO selects from this list and assigns the case with a single action.

---

### IO Workflow

Once assigned, the case appears on the IO's dashboard. The IO works within a structured **Investigation Workspace** — a unified interface containing every tool needed to conduct and document the investigation.

#### AI Analysis & Investigation Intelligence

The IO sees the same AI analysis as the SHO, but the analysis goes deeper on the investigative side. It actively assists the IO in building the case:

**Case Participants**
The AI identifies and suggests individuals who should be formally added to the case as participants, each with a designated role:

| Role | Description |
|---|---|
| **Victim** | Person(s) directly harmed |
| **Witness** | Individuals with relevant knowledge of the incident |
| **Suspect** | Persons of interest based on current evidence |

For each suggested participant, the AI provides:
- Detailed reasoning drawn from the evidence
- Applicable legal sections — **BNS sections** for suspects, **BSA sections** for evidence — retrieved using a legal knowledge base built on BNS, BNSS, BSA, Standard Operating Procedures, and the Department Registry

The IO reviews each suggestion and accepts or rejects it. Accepted participants are added to the case.

**Next Steps**
The analysis also recommends concrete next investigation steps — what actions the IO should take, what evidence still needs to be gathered, and which departments or agencies to contact. These suggestions feed directly into the investigation workflow.

**Legal Section Retrieval via RAG**
All legal section suggestions (for participants, for evidence, for the case as a whole) are retrieved using **Retrieval-Augmented Generation (RAG)** — a technique where the AI searches a curated legal knowledge base (BNS, BNSS, BSA, SOPs, and the Department Registry) to find the most relevant sections for the specific facts of the case, rather than relying on general training data alone. This ensures legal accuracy grounded in the actual statutes.

#### AI Copilot

The IO has access to a **Copilot interface** available at all times within the Investigation Workspace. The Copilot operates in two distinct modes:

**ASK Mode**
The IO types any question related to the case in natural language. The Copilot uses the same RAG-based legal knowledge base to retrieve relevant laws, sections, and precedents, then answers the question with full context from the case. Examples:

- *"What sections apply to online financial fraud of this nature?"*
- *"What evidence do we still need to establish intent?"*
- *"Summarize everything we know about the primary suspect."*

**AGENT Mode**
The IO describes a line of investigation or asks the Copilot to evaluate the current state of the case. The agent:

1. Fetches the complete, up-to-date state of the case from the database
2. Combines it with the IO's query
3. Re-runs the full AI analysis pipeline
4. Returns updated and progressive suggestions — new participant recommendations, updated legal sections, revised next steps, refined reasoning

Every Agent mode conversation advances the investigation. Each interaction produces a new analysis snapshot that builds on the previous one, so the case intelligence compounds over time rather than starting from scratch.

#### Department Communication

During investigation, IOs frequently need to request information from external departments — forensic labs, medical examiners, banks, telecom providers, government agencies, and others.

The AI automatically generates **ready-to-send formal draft letters** addressed to the relevant departments. These drafts:

- Are written in official language with the correct legal citations (BNSS sections)
- Specify exactly what information is being requested
- Include a reasonable response deadline and the IO's details

The IO reviews the draft and sends it with a single click. The email is dispatched directly to the department's registered contact.

**Continuous Email Polling** — The platform continuously monitors for incoming email responses from departments. When a reply arrives, it is automatically attached to the relevant request thread in the case, the corresponding checklist step is marked complete, the new information is added as evidence, and the AI re-analyzes the case with the new data.

#### Case Participants

The Case Participants section is a structured registry of all individuals connected to the case. For each participant, the IO can maintain:

- **Contact details** and identifiers (Aadhaar, PAN, phone number, etc.) with the option to attach identifier documents or photographs
- **Statements** — recorded either as written text directly, or as audio files that are automatically transcribed to text. Statements are timestamped and preserved
- **Progressive Reasoning** — an evolving, editable reasoning document that captures why this person is connected to the case, how their role has evolved over the investigation, and what the latest assessment is. This reasoning is updated collaboratively between the IO and the AI Copilot's Agent mode as the investigation progresses
- **Applicable Legal Sections** — sections attached to suspects and accused with the IO's confirmation and timestamp

Suspects can be formally **promoted to Accused** as the evidence warrants, which updates their status throughout the case and in the final charge sheet.

#### Custody Tab

The Custody tab provides an overview of all suspects currently in custody. It displays relevant custody details, dates, and any associated information for each individual, giving the IO and SHO a clear picture of the current custody situation at any point in the investigation.

#### Case Diary

The Case Diary is the official daily log of the investigation — a legal requirement under Indian law. Crime OS makes maintaining this effortless:

- **Auto-logging** — Every action taken within the platform (evidence added, participant approved, department request sent, step completed, analysis run, etc.) is automatically logged as a diary entry with a precise timestamp. Nothing is missed.
- **AI-Generated Summaries** — For each logged event, the AI generates a concise, professional summary describing what happened and its significance to the investigation. Even minor updates get a proper contextual entry.
- **Finalized Diary PDFs** — Diary entries are compiled into the official Roznamcha format, available in both English and bilingual Gujarati-English variants, and can be downloaded as PDFs at any time.

The result is that the IO's case diary practically writes itself — every investigative action is documented automatically without the officer needing to stop and write notes.

#### Evidence Management

The IO can view all evidence attached to the case from a dedicated evidence panel. For each item:

- The file is viewable directly (image preview, audio/video playback, document viewer)
- All AI-extracted details are displayed: transcription, object detection tags, OCR text, GPS coordinates extracted from photo metadata, AI summary and classification, and processing status
- Legal sections applicable to the evidence (BSA) are shown, with the option to attach them formally
- Links to related case participants are shown, connecting evidence to the people it implicates
- Physical evidence items show a full **custody chain** — a log of every transfer, storage location, and custody change, from first collection to current status

#### Confidence Score

A **dynamic Confidence Score** is maintained throughout the investigation. This score is a calculated percentage that reflects the overall strength of the case at any given moment, based on:

- How much of the required evidence has been collected
- How many investigation steps have been completed
- How well different pieces of evidence corroborate each other

The score updates automatically every time new evidence is added, a step is completed, or the analysis is re-run. It gives the IO a clear, objective indicator of how ready the case is to proceed — and highlights when more work is needed before moving forward.

#### Charge Sheet Generation

When the IO is confident the investigation is complete and the case is strong, they initiate **Charge Sheet Generation**. The platform assembles and generates a comprehensive legal document automatically:

**What it contains:**
- Complete case summary and background
- All victims, witnesses, suspects, and accused — with their statements, identifiers, and applied legal sections
- Deep analysis of the investigation: findings, reasoning, and conclusions
- All evidence collected, with references and AI analysis
- A full summary of all department requests and the responses received
- All case diary entries
- An **Annexures section** containing direct links to all original documents — evidence files, department reports, FIR — stored in the CDN (cloud storage), so the court can access the source documents directly from the charge sheet

**AI-generated narratives** are written for four key sections: brief case description, investigation summary, investigation findings, and final report. All sections are editable by the IO before finalization.

The charge sheet can be **downloaded as a PDF** at any point. Multiple versions are maintained (v1, v2, etc.) as the document evolves.

---

### Case Closure & Vector Embedding

When the investigation concludes and the charge sheet is ready, the IO closes the case. Upon closure:

- The complete case — all participants, evidence, diary entries, analysis, legal sections, and outcomes — is compiled into a **vector embedding** and stored in the system's knowledge base.
- This embedding is used directly by the **IO Recommendation engine** that the SHO sees when assigning future cases. As more cases are closed, the system becomes progressively smarter at matching new cases to the most suitable investigating officers based on genuine past experience.

All case data remains permanently accessible after closure. Nothing is deleted — the full record is preserved for audit, appeals, or future reference.

---

### Multi-Language Support

The entire platform is fully supported in three languages:

| Language | Script |
|---|---|
| English | Latin |
| Hindi | Devanagari |
| Gujarati | Gujarati script |

Every interface element, label, AI-generated content, analysis narrative, draft letters, case diary, and FIR document is available in the officer's preferred language. The language preference is persistent across sessions.

---

## 4. Tech Stack

### Application Layer

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| **Backend API** | Node.js / Express (TypeScript) |
| **Database** | MongoDB with Mongoose ODM |
| **File Storage** | Cloudinary (direct signed-URL uploads — server never handles file bytes) |
| **Caching & Queues** | Redis + BullMQ for background job processing and inter-service pub/sub |
| **Email** | Nodemailer + Gmail OAuth2 (sending department request emails and polling for replies) |
| **PDF Generation** | PDFKit (FIR, case diary, charge sheet) with embedded NotoSansGujarati font for Gujarati script |

---

### Python AI Microservices

All AI and ML workloads run as independent Python FastAPI services. Each service is isolated, independently scalable, and communicates with the Node.js backend over HTTP.

#### 1. Complaint Intelligence Service
The primary evidence processing pipeline. Every file uploaded to a case passes through this service.

| Media Type | Processing |
|---|---|
| **PDF** | `PyMuPDF (fitz)` extracts the embedded text layer per page. Scanned/image-only pages are automatically detected and routed to Florence-2 for OCR instead. |
| **Images & Scanned PDFs** | `microsoft/Florence-2-base` (via a dedicated Florence REST microservice) runs with the `<MORE_DETAILED_CAPTION>` task to produce a rich natural-language description, from which scene type, tags, and entity flags (people, vehicles, weapons, documents) are parsed. PaddleOCR 2.7.3 runs in parallel on images to extract any printed or handwritten text. |
| **Audio** | `faster-whisper` (CTranslate2 backend, `tiny` model) transcribes speech to text, auto-detects the source language, and produces an English translation if the source is non-English. VAD (Voice Activity Detection) filtering is applied to skip silent segments. |
| **Video** | `scenedetect` (OpenCV-based, frame-difference algorithm) detects scene boundaries and extracts keyframes. `moviepy` extracts the audio track, which is then passed through the same Whisper transcription pipeline. Extracted keyframes are processed by Florence-2 for visual captioning. |
| **NER / Entity Extraction** | `spaCy (en_core_web_sm)` performs named entity recognition across all extracted text to identify people, locations, organisations, and dates. |

#### 2. Florence-2 Service
A standalone FastAPI microservice wrapping `microsoft/Florence-2-base`. Loaded once on startup and kept resident in memory. Accepts base64-encoded images and returns structured captions.

#### 3. Legal Agent Service
The RAG (Retrieval-Augmented Generation) engine that powers all legal section lookups — used in AI analysis, Copilot queries, and case participant reasoning.

**Knowledge Base:** BNS, BNSS, BSA, Standard Operating Procedures (SOPs), and the Department Registry — all embedded and stored in Qdrant.

**Retrieval Pipeline:**
```
Query
  → BM25 Search (keyword, schema-aware field weighting)
  → Vector Search (Qdrant cosine similarity)
  → Weighted Reciprocal Rank Fusion  [BM25: 0.4 | Vector: 0.6]
  → ONNX Reranker (cross-encoder, exported to ONNX for low-latency CPU inference)
  → Top 5 context sections returned
```

**Embedding Model:** `BAAI/bge-base-en-v1.5` (via `sentence-transformers`) — a symmetric dense retrieval model. Falls back to `nomic-embed-text-v2-moe` served via `llama.cpp` if sentence-transformers is not available locally.

This hybrid approach — BM25 for keyword precision, vector search for semantic similarity, fused and reranked — was tested and validated to produce significantly better section retrieval than either method alone.

#### 4. IO Recommendation Service
A FastAPI service that powers the IO assignment suggestions the SHO sees when assigning a case.

When a case is **closed**, the complete case data is converted to structured text, embedded, and stored in Qdrant. When a SHO opens the assignment screen for a **new case**, the service:
1. Embeds the new complaint using `nomic-embed-text-v2-moe` (GGUF quantized, served by `llama.cpp`)
2. Retrieves the top-50 most similar closed cases from Qdrant, filtered by station
3. Aggregates similarity scores per officer using weighted voting
4. Returns officers ranked by score (0–100) with matched case count and similarity reasoning

**Embedding Model:** `nomic-embed-text-v2-moe` Q4_K_M (GGUF) — an asymmetric model using `search_document:` and `search_query:` prefixes for document vs. query embedding. 768-dimensional vectors.

---

### Primary LLM — Gemma 4 (gemma4:e2b via Ollama)

All generative AI tasks on the platform — investigation analysis, Copilot responses, department request drafts, escalation summaries, charge sheet narratives, and more — are handled by **`gemma4:e2b`**, run locally via **Ollama** with a 32,768-token context window.

The model is used in two modes depending on the task:
- **Fast calls** (temperature 0.3, 512 tokens) — quick summaries, copilot factual answers, escalation drafts
- **Deep calls** (temperature 0.1, 1024 tokens, JSON mode) — full investigation analysis, charge sheet generation, department request letters, Copilot agent proposals

---

### Translation System

The platform supports English, Hindi, and Gujarati across every page. Translation is handled by sending Gemma (via Ollama) the full block of UI text for a given page and receiving the translated version back in JSON format.

Key design decision: translation is done **per page, on first visit**, then cached. This means:
- The first time an officer visits a page in a non-English language, the text is translated in the background with minimal interruption
- Every subsequent visit to the same page in the same language is served instantly from cache
- There is no pre-translation of the entire application — only the pages actually visited are ever translated

This gives the system a smooth, low-latency multilingual experience without the overhead of translating content that is never seen.

---

### Vector Database

**Qdrant** is used as the vector store across all services:
- Legal section embeddings (BNS, BNSS, BSA, SOPs, Department Registry) — queried by the Legal Agent
- Closed case embeddings — queried by the IO Recommendation service
- Department Registry vectors — synced live as the admin adds or deactivates departments

---

## 5. Dependencies & Requirements

### System Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 20 LTS | Backend API + Frontend |
| **Python** | 3.12 | All Python AI services — **3.13 is not supported** (Florence-2 breaks) |
| **Docker Desktop** | Latest | Required to run Redis and Qdrant as containers |
| **Ollama** | Latest | Local LLM server for gemma4:e2b |
| **ffmpeg** | Any | Required by `moviepy` for video audio extraction — must be on system PATH |
| **MongoDB** | 6.0+ | Run locally or connect via Atlas URI |

---

### Node.js — Backend (`backend/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.19 | HTTP server and routing |
| `mongoose` | ^8.4 | MongoDB ODM |
| `bullmq` | ^5.8 | Background job queues (evidence, email, diary PDF) |
| `ioredis` | ^5.4 | Redis client (caching + BullMQ + SSE pub/sub) |
| `jsonwebtoken` | ^9.0 | JWT access + refresh token generation |
| `bcrypt` | ^5.1 | Password hashing |
| `pdfkit` | ^0.19 | FIR, case diary, charge sheet PDF generation |
| `cloudinary` | ^2.10 | Signed URL generation + file metadata |
| `googleapis` | ^173 | Gmail OAuth2 (send department emails + poll replies) |
| `nodemailer` | ^9.0 | SMTP email dispatch |
| `@google/genai` | ^2.13 | Gemini API client (fallback LLM) |
| `axios` | ^1.7 | HTTP calls to Python microservices |
| `helmet` | ^7.1 | Security headers |
| `rate-limiter-flexible` | ^5.0 | API rate limiting |
| `joi` | ^17.13 | Request body validation |
| `multer` | ^2.2 | Multipart file upload handling |
| `uuid` | ^14.0 | UUID generation |
| `cookie-parser` | ^1.4 | HTTP-only cookie parsing |
| `compression` | ^1.7 | Response compression |
| `qrcode` | ^1.5 | QR code generation for citizen token links |
| `winston` | ^3.13 | Structured logging |

---

### Node.js — Frontend (`frontend/package.json`)

| Package | Version | Purpose |
|---|---|---|
| `next` | 14.2.23 | App Router framework |
| `react` / `react-dom` | ^18 | UI rendering |
| `typescript` | ^5 | Type safety |
| `tailwindcss` | ^3.4 | Utility CSS |
| `axios` | ^1.18 | API calls |
| `react-hook-form` | ^7.81 | Form state management |
| `react-markdown` | ^10.1 | Renders AI markdown responses |
| `lucide-react` | ^1.24 | Icon library |
| `js-cookie` | ^3.0 | Cookie access in browser |

---

### Python — Complaint Intelligence Service

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.115.6 | HTTP API framework |
| `uvicorn[standard]` | 0.32.1 | ASGI server |
| `pydantic` | 2.10.3 | Schema validation |
| `redis` | 5.2.1 | Async Redis for job queue |
| `httpx` | 0.28.1 | Async HTTP client |
| `spacy` | 3.8.14 | NER — run `python -m spacy download en_core_web_sm` after install |
| `faster-whisper` | 1.1.1 | Audio transcription (CTranslate2) |
| `pymupdf` | ≥1.24.14 | PDF text extraction |
| `scenedetect[opencv]` | 0.6.4 | Video scene boundary detection |
| `moviepy` | 1.0.3 | Video audio track extraction |
| `opencv-python-headless` | 4.10 | Keyframe extraction |
| `Pillow` | 10.4.0 | Image processing |
| `cloudinary` | ≥2.0 | Evidence file upload |
| `pydub` | 0.25.1 | Audio metadata fallback |
| `langdetect` | 1.0.9 | Source language detection |
| `python-magic-bin` | ≥0.4.14 | MIME type detection |

### Python — Florence-2 Service

| Package | Version | Purpose |
|---|---|---|
| `torch` | 2.13.0 | Model inference |
| `torchvision` | 0.28.0 | — |
| `transformers` | 4.41.2 | Florence-2 model loading |
| `einops` | 0.8.2 | Tensor operations required by Florence-2 |
| `timm` | 1.0.28 | Vision model backbone |
| `Pillow` | 10.4.0 | Image decoding |

### Python — Legal Agent Service

| Package | Version | Purpose |
|---|---|---|
| `pydantic` | ≥2.0 | — |
| `PyMuPDF` | ≥1.23 | Legal corpus PDF parsing |
| `qdrant-client` | ≥1.10 | Vector search |
| `sentence-transformers` | ≥3.0 | BGE embedding (primary) |
| `transformers` | 4.41.2 | Tokenizers |
| `optimum[onnxruntime]` | ≥1.20 | ONNX reranker export |
| `onnxruntime` | ≥1.18 | Fast CPU inference for reranker |
| `torch` | ≥2.0 | — |

### Python — IO Recommendation Service

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | ≥0.111 | — |
| `uvicorn[standard]` | ≥0.30 | — |
| `pydantic` | ≥2.7 | — |
| `qdrant-client` | ≥1.9.1, <1.10 | Vector store |
| `httpx` | ≥0.27 | Calls llama.cpp embedding server |
| `pydantic-settings` | ≥2.2 | Config management |

---

### External Services Required

| Service | Purpose | Setup |
|---|---|---|
| **MongoDB** | Primary database | Local install or MongoDB Atlas URI |
| **Cloudinary** | File + PDF storage | Create a free account at cloudinary.com |
| **Gmail account** | Department email dispatch + polling | Enable OAuth2 in Google Cloud Console |

---

## 6. Setup & Installation

### Step 1 — Clone & verify Python version

```bash
git clone <repo-url>
cd CRIME_OS

# Confirm Python 3.12 is active — 3.13 breaks Florence-2
python --version
```

---

### Step 2 — Start Docker services (Redis + Qdrant)

Docker Desktop must be running before anything else.

```bash
docker run -d --name crime-os-redis -p 6379:6379 redis:alpine
docker run -d --name crime-os-qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

---

### Step 3 — Create shared Python virtual environment

All four Python services share a single `.venv` at the project root.

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

Install dependencies for each service:

```bash
pip install -r services/complaint_intelligence/requirements.txt
pip install -r services/florence_service/requirements.txt
pip install -r services/legal_agent/requirements.txt
pip install -r services/io-recommendation/requirements.txt

# Download spaCy NER model (required by Complaint Intelligence)
python -m spacy download en_core_web_sm
```

Export the ONNX reranker weights for the Legal Agent (one-time):

```bash
cd services/legal_agent
python export_weights.py
cd ../..
```

---

### Step 4 — Install and pull the LLM

Install Ollama from [ollama.com](https://ollama.com), then pull the model:

```bash
ollama pull gemma4:e2b
```

---

### Step 5 — Install backend dependencies

```bash
cd backend
npm install
```

Copy and fill in the environment file:

```bash
cp .env.example .env
```

Required values to set in `backend/.env`:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Random secret string (min 32 chars) |
| `JWT_REFRESH_SECRET` | Different random secret string |
| `COOKIE_SECRET` | Random secret for signed cookies |
| `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | — |
| `CLOUDINARY_API_SECRET` | — |
| `GMAIL_CLIENT_ID` | From Google Cloud Console OAuth2 client |
| `GMAIL_CLIENT_SECRET` | — |
| `GMAIL_REFRESH_TOKEN` | Generate via Google OAuth Playground |
| `GMAIL_POLICE_EMAIL` | Gmail address used for sending/receiving |

All other values (ports, Ollama URL, service URLs) use sensible defaults and typically do not need to change for local development.

---

### Step 6 — Install frontend dependencies

```bash
cd frontend
npm install
```

---

### Step 7 — Seed the database

Create the initial admin account and station data:

```bash
cd backend
npx ts-node src/scripts/seed-police.ts
```

---

### Step 8 — Ingest the legal knowledge base into Qdrant

The Legal Agent needs BNS, BNSS, BSA, SOPs, and the Department Registry embedded into Qdrant before it can serve legal section lookups. From the legal agent directory:

```bash
cd services/legal_agent

# Embed all parsed records (legal sections + SOPs + dept registry)
python -m ingestion.embed_records parsed --out embedded/all_embeddings.jsonl

# Ingest into Qdrant (must be running on :6333)
python -m ingestion.ingest_qdrant embedded/all_embeddings.jsonl
```

---

### Step 9 — Start everything

Run the startup script from the project root:

```bash
start_all.bat
```

This opens separate terminal windows for each service in the correct startup order:

1. Ollama (LLM server)
2. Legal Agent — port 8004
3. IO Recommendation — port 8003
4. Complaint Intelligence — port 8001
5. Florence-2 Service — port 8002
6. Backend (Node.js) — port 5001
7. Frontend (Next.js) — port 3000

The platform is ready when all windows show their respective startup messages. Open `http://localhost:3000` to access the application.

---

### Service Port Reference

| Service | Port |
|---|---|
| Next.js Frontend | 3000 |
| Node.js Backend | 5001 |
| Complaint Intelligence | 8001 |
| Florence-2 | 8002 |
| IO Recommendation | 8003 |
| Legal Agent | 8004 |
| Ollama | 11434 |
| llama.cpp (nomic embeddings) | 8080 |
| MongoDB | 27017 |
| Redis | 6379 |
| Qdrant HTTP | 6333 |
| Qdrant gRPC | 6334 |

---

*Crime OS — Built for Gujarat Police | SVNIT*
