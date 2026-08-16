# Crime OS — API Documentation

> Complete reference for all REST API endpoints exposed by the Crime OS backend.  
> **Base URL:** `http://localhost:5001/api/v1`  
> **Auth:** JWT access token in `Authorization: Bearer <token>` header (where required).  
> **Roles:** `ADMIN` · `SHO` (Station House Officer) · `IO` (Investigating Officer) · `USER` (citizen — unused in current flow, kept for reference)

Endpoints are ordered to follow the natural flow of data through the platform: from system health → admin setup → officer login → complaint filing → SHO review → IO investigation → case closure.

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Admin — Setup & Management](#2-admin--setup--management)
   - [Admin Auth](#admin-auth)
   - [Police Stations](#police-stations)
   - [Officers](#officers)
   - [Department Registry](#department-registry)
3. [Officer Auth](#3-officer-auth)
4. [Complaint Filing](#4-complaint-filing)
5. [SHO Actions](#5-sho-actions)
6. [Investigation — AI Analysis](#6-investigation--ai-analysis)
7. [Investigation — Copilot](#7-investigation--copilot)
8. [Investigation — Checklist](#8-investigation--checklist)
9. [Investigation — Department Requests & Threads](#9-investigation--department-requests--threads)
10. [Investigation — Citizen Requests](#10-investigation--citizen-requests)
11. [Citizen Request Portal (Token-based, No Auth)](#11-citizen-request-portal-token-based-no-auth)
12. [Investigation — Case Participants](#12-investigation--case-participants)
13. [Investigation — Evidence](#13-investigation--evidence)
14. [Investigation — Case Diary](#14-investigation--case-diary)
15. [Investigation — Escalation](#15-investigation--escalation)
16. [Charge Sheet](#16-charge-sheet)
17. [Case Closure & IO Recommendation](#17-case-closure--io-recommendation)
18. [Case Understanding](#18-case-understanding)
19. [Translation](#19-translation)
20. [Private Case Room (Multiple IO Collaboration)](#20-private-case-room-multiple-io-collaboration)
21. [Prompt Compression Service](#21-prompt-compression-service)

---

## 1. Health Check

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/health` | None |

Returns the API liveness status, current timestamp, and environment. No authentication required. Used by monitoring and the `start_all.bat` startup script to confirm the backend is running.

---

## 2. Admin — Setup & Management

> All admin endpoints require `ADMIN` role.  
> Admin accounts cannot manage investigation data — they are strictly for platform setup.

### Admin Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/admin/login` | None | Logs in the admin with username + password. Returns JWT access token and sets a refresh token cookie. |
| `GET` | `/admin/me` | ADMIN | Returns the current admin's profile. |
| `POST` | `/admin/logout` | ADMIN | Invalidates the admin refresh token from Redis and clears the cookie. |

---

### Police Stations

CRUD operations for managing police stations in the system.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/police-stations` | Creates a new police station. Validates that the `code` is unique (codes are immutable after creation). Body: `name`, `code`, `address`, `city`, `district`, `pincode`, `phone?`, `email?`. |
| `GET` | `/admin/police-stations` | Lists all police stations, sorted by creation date. |
| `GET` | `/admin/police-stations/:id` | Fetches a single police station by its MongoDB `_id`. |
| `PUT` | `/admin/police-stations/:id` | Updates a police station's details. All fields are editable except `code`. |
| `DELETE` | `/admin/police-stations/:id` | Deletes a station. Blocked if any officers are still assigned to it — must reassign or delete officers first. |

---

### Officers

CRUD operations for SHO and IO accounts. Officers cannot self-register.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/admin/officers` | Creates a new police officer. Hashes password, validates station exists, checks email and badge number for uniqueness. Body: `name`, `email`, `badgeNumber`, `password`, `role` (`SHO` or `IO`), `policeStation` (ObjectId), `phone?`. |
| `GET` | `/admin/officers` | Lists all officers with their station (name, code, city, district) populated. |
| `GET` | `/admin/officers/:id` | Fetches a single officer with station details populated. |
| `PUT` | `/admin/officers/:id` | Updates officer details. Password is re-hashed if provided; leave blank to keep current. Validates uniqueness of email and badge number if changed. |
| `DELETE` | `/admin/officers/:id` | Hard-deletes an officer record from the system. |

---

### Department Registry

Manages the registry of external departments (forensic labs, banks, telecom providers, courts, etc.) that the IO can send requests to. Each active department is also embedded into the Qdrant vector database so the AI analysis and Legal Agent can retrieve them during RAG.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/departments` | Lists all registered departments (both active and inactive), sorted by status then name. |
| `POST` | `/admin/departments` | Creates a new department entry and **simultaneously embeds it into Qdrant** so the AI knows about it. Body: `entity_id`, `entity_name`, `category`, `contact_email?`, `what_they_can_provide` (array), `legal_basis_typically_cited` (array), `typical_response_time`, `confidence` (`high`/`medium`/`low`), `escalation_path_if_no_response`, `notes_or_caveats`. |
| `PUT` | `/admin/departments/:id` | Updates a department record and **re-embeds** its updated vector into Qdrant, overwriting the existing one in-place using the stored `qdrant_uuid`. |
| `PATCH` | `/admin/departments/:id/deactivate` | Soft-deactivates a department (`isActive: false`) and **removes its vector from Qdrant** so it no longer appears in AI analysis or request suggestions. |
| `PATCH` | `/admin/departments/:id/activate` | Re-activates a department and **re-inserts its vector into Qdrant**, making it available for AI retrieval again. |

---

## 3. Officer Auth

> Standard login/logout flow for SHO and IO officers. No self-registration — accounts are created by admin only.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/police/login` | None (rate-limited) | Officer login using email + password. Issues a JWT access token in the response and a refresh token as an HttpOnly cookie. Body: `email`, `password`. |
| `GET` | `/police/me` | SHO or IO | Returns the currently authenticated officer's full profile — name, badge number, role, and assigned station. |
| `POST` | `/police/logout` | SHO or IO | Invalidates the officer's refresh token from Redis and clears the cookie. |

---

## 4. Complaint Filing

> Complaints are filed by officers (SHO or IO) on behalf of complainants.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/complaints/police-stations/search` | Authenticated | Searches police stations by name or code. Used in the complaint form's station picker. Query: `?q=<search_term>`. |
| `POST` | `/complaints/multimodal-intake` | SHO or IO | AI-powered pre-filing analysis. Accepts complaint text and/or uploaded files (images, audio, PDF, video). Forwards everything to the Python Complaint Intelligence service and returns a structured analysis profile — extracted entities, category suggestion, missing information. This is used before officially filing to help the officer understand the complaint. Body: `text?` (string), `files[]` (multipart). |
| `POST` | `/complaints/upload-signature` | SHO or IO | Returns a Cloudinary signed upload URL + signature so the browser can upload evidence files **directly to CDN** without the file passing through this server. The backend never handles the file bytes. Query: `?caseId=<id>` (optional). |
| `POST` | `/complaints` | SHO or IO | **Files the complaint officially.** Creates the complaint record in MongoDB (status: `SUBMITTED`) and triggers the background AI pipeline (evidence processing + case analysis) asynchronously. Body: `title`, `description`, `category`, `policeStation` (ObjectId), `incidentDate`, `incidentPlace`, `evidence?[]`, `location?`. |
| `GET` | `/complaints/station/list` | SHO or IO | Lists all complaints at the officer's station. Supports filtering and pagination. Query: `?status=`, `?search=`, `?page=`, `?limit=`. |
| `GET` | `/complaints/:id` | SHO or IO | Fetches a single complaint by `_id` with full detail including evidence and current status. Officers can only access complaints within their station. |
| `POST` | `/complaints/:id/evidence` | SHO or IO | Adds a digital evidence item (already uploaded to Cloudinary) to a complaint. Body: `{ type, url, description, cloudinaryPublicId, ... }`. |
| `POST` | `/complaints/:id/physical-evidence` | IO | Adds a physical evidence record (seized objects, documents). Body: `{ name, description, currentLocation?, custodyDetails? }`. |

---

## 5. SHO Actions

> These endpoints are exclusive to the SHO role and represent the SHO's decision-making over the complaint queue.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/complaints/police/ios` | SHO | Lists Investigation Officers at the caller's station — used when assigning a case. Returns an AI-ranked list: each IO has a `recommendationScore` (0–100) and `reasons[]` from the IO Recommendation service, based on similarity to their previously handled closed cases. |
| `PATCH` | `/complaints/:id/approve` | SHO | Approves a complaint and assigns it to a specific IO. Updates status to `ASSIGNED_TO_IO`, creates the initial case checklist by calling the Complaint Intelligence service with the full case context. Body: `{ assignedIO: <officerId> }`. |
| `PATCH` | `/complaints/:id/reject` | SHO | Rejects a complaint with a written reason. Updates status to `REJECTED` and enqueues an automated rejection notification email to the complainant. Body: `{ rejectionReason: string }`. |
| `POST` | `/complaints/:id/fir/prepare` | SHO | Fetches and returns pre-assembled FIR form data from the complaint — all fields pre-populated from case data, ready for the SHO to review and edit before registering the FIR. |
| `PATCH` | `/complaints/:id/register-fir` | SHO | **Officially registers the FIR.** Updates complaint status to `FIR_REGISTERED`, assigns a FIR number, and enqueues PDF generation for both English and bilingual Gujarati-English FIR documents. Body: `{ firFormData?: { ... } }` (optional override of pre-filled data). |
| `PATCH` | `/complaints/:id/close` | SHO or IO | Closes a case (status: `CLOSED`). After closing, the backend calls the IO Recommendation service to embed this case as a vector in Qdrant, seeding future IO recommendations. |

---

## 6. Investigation — AI Analysis

> Analysis runs are the core AI loop of the investigation. All require SHO or IO auth.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases/:id/analyze` | **Triggers a full AI analysis run** for the case. Returns `202 Accepted` immediately — the actual work happens asynchronously via BullMQ. The orchestrator: assembles all case facts, queries the Legal Agent RAG, calculates confidence score, runs fast + deep LLM passes (gemma4:e2b), saves an `AnalysisSnapshot` to MongoDB. Body: `{ language?: "en"/"hi"/"gu" }`. |
| `GET` | `/cases/:id/analysis/status` | **State-recovery endpoint.** Returns the current progress stage from Redis (`"idle"`, `"queued"`, `"facts_assembled"`, `"legal_retrieved"`, etc.). The frontend calls this on page load before opening the SSE connection, to decide whether to show a running progress bar or a completed state. |
| `GET` | `/cases/:id/analysis/progress` | **SSE (Server-Sent Events) stream.** Opens a persistent connection and streams real-time analysis stage progress events published by the BullMQ worker via Redis pub/sub. Each event: `{ stage, message, progress }`. Sends a keepalive comment every 20 seconds. Automatically closes when `done` or `error` is emitted. |
| `GET` | `/cases/:id/analysis/latest` | Returns the most recently created `AnalysisSnapshot` for the case — including narrative summary, confidence breakdown, suggested legal sections, participant recommendations, and next steps. |
| `GET` | `/cases/:id/analysis/:snapshotId` | Returns a specific historical `AnalysisSnapshot` by its ID. Useful for reviewing the audit trail of how the analysis evolved. |
| `POST` | `/cases/:id/analysis/:snapshotId/correct` | **Officer correction of an AI snapshot.** The IO provides a plain-text correction message. The orchestrator runs a targeted LLM correction pass against the snapshot and creates a new snapshot linked to the original via `parent_snapshot_id`. Body: `{ correction_message: string }`. |
| `POST` | `/cases/:id/analysis/manual` | **Creates a fully manual snapshot** without any LLM involvement. The officer supplies all fields directly. Body: `{ narrative_summary, ranked_next_steps?: [], suspect_candidates?: [], suggested_legal_sections?: [] }`. |

---

## 7. Investigation — Copilot

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases/:id/copilot/ask` | **Sends a message to the AI Copilot.** The copilot first queries the Legal Agent RAG to retrieve relevant BNS/BNSS/BSA/SOP sections, then calls Ollama (gemma4:e2b). In **ASK mode** (factual questions), returns a direct markdown answer. In **AGENT mode** (instructions or case-state queries), fetches the full live case state from MongoDB, re-runs the analysis pipeline, and returns a structured **proposal** (e.g., `add_step`, `draft_request`) which the officer must explicitly apply. Body: `{ message: string, language?: string }`. |

---

## 8. Investigation — Checklist

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/:id/checklist` | Returns the full investigation checklist: all steps with their status (`pending`, `active`, `completed`, `blocked`), criticality (`high`/`medium`/`low`), required evidence, and type (`department`, `internal`, `citizen`). |
| `POST` | `/cases/:id/checklist/steps` | Manually adds a new step to the checklist. Also used when the IO applies a Copilot-suggested step via the "Apply this change" button. Body: `{ title, description?, criticality? }`. |
| `POST` | `/cases/:id/checklist/:stepId/complete` | Marks a specific checklist step as completed. |

---

## 9. Investigation — Department Requests & Threads

### Request Composer

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/departments` | Lists all active departments from the registry for use in the request-composer dropdown. |
| `POST` | `/cases/:id/requests/draft` | **AI-generates a formal department request letter.** Calls the Legal Agent to retrieve relevant BNSS citations, then calls Ollama (deep call) to write a complete formal letter with the correct IO details, specific data being requested, and a deadline. Body: `{ step_id, department_entity_id, request_type?, recipient_type? }`. |
| `PATCH` | `/cases/:id/requests/:reqId` | Updates an editable request draft (only while status is `draft` or `reviewed`). Body: `{ draft_content?, attachments?, status? }`. |
| `POST` | `/cases/:id/requests/:reqId/send` | **Finalizes and sends a department request.** Locks the linked checklist step as `blocked` (awaiting response), enqueues the email via BullMQ for dispatch to the department's contact address. |
| `GET` | `/cases/:id/requests` | Lists all department requests filed for the case, sorted newest first. |

### Request Threads

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/:id/threads` | Lists all request threads for the case (both department and citizen threads). |
| `GET` | `/cases/threads/:threadId` | Fetches a single thread with its full message history — original request, all replies, and attached evidence links. |
| `POST` | `/cases/threads/:threadId/reply` | IO posts a reply to a thread. Body: `{ content: string, attachments?: [] }`. |
| `POST` | `/cases/threads/:threadId/format-response` | Passes the latest thread response text through the LLM (Ollama fast call) to rewrite it in formal official language. Useful for polishing rough draft replies. |
| `POST` | `/cases/:id/threads/:thread_id/export-pdf` | Exports the complete thread conversation (all messages, timestamps, attachments) to a PDF, uploads it to Cloudinary, and returns the PDF URL. |

---

## 10. Investigation — Citizen Requests

> These create requests directed at the complainant (not external departments).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases/:id/citizen-request` | **IO requests additional evidence from the complainant**, tied to a specific checklist step. Uses Ollama to draft a polite plain-language email. Creates a `RequestThread`, marks the checklist step as `blocked`, generates a one-time secure token, and enqueues an email to the complainant containing a link to the Citizen Request Portal. Body: `{ step_id }`. |
| `POST` | `/cases/:id/citizen-request/missing-info` | **IO requests information identified as missing by the AI analysis** (not tied to a checklist step). Directly uses an AI-identified `missing_information` item from the latest snapshot. Drafts and sends the same way as above. Body: `{ item, reason?, importance?, type? }`. |

---

## 11. Citizen Request Portal (Token-based, No Auth)

> **Public endpoints** — no JWT required. The complainant accesses these via a unique one-time token link sent to their email by the IO.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/citizen-request/:token` | Validates the token and returns the request details — case reference number, what information/evidence is being requested, status, and expiry. Used to render the citizen-facing response page. |
| `POST` | `/citizen-request/:token/response` | **Citizen submits their response.** Accepts a text message and/or file uploads (images, audio, PDF, video — max 50MB each). Creates evidence records in MongoDB, marks the request as `response_received`, unblocks the linked checklist step, and asynchronously triggers the Python AI pipeline to process any uploaded files. Body: `message?` (text), `files[]` (multipart). |

---

## 12. Investigation — Case Participants

> All require SHO or IO auth. Participants are the people formally connected to the case — victims, witnesses, suspects, accused.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/:id/participants` | Lists all participants linked to the case with their roles, contact details, statements, reasoning, legal sections, and profile data. |
| `POST` | `/cases/:id/participants` | Manually creates a new participant. Body: `{ name, roles: ["victim"/"witness"/"suspect"/"accused"/"complainant"], contact?, identifiers?[], victimProfile?, witnessProfile?, suspectProfile?, complainantProfile? }`. |
| `POST` | `/cases/:id/participants/recommendations/approve` | **Approves an AI-recommended participant** from the latest `AnalysisSnapshot`. Creates the participant record, optionally with pre-attached AI reasoning and suggested sections. Body: `{ recommendation, snapshot_id?, contact?, ...profile fields }`. |
| `PATCH` | `/cases/:id/participants/:participantId` | Updates a participant's details (contact info, identifiers, profile fields, etc.). |
| `DELETE` | `/cases/:id/participants/:participantId` | Removes a participant from the case. |
| `PATCH` | `/cases/:id/participants/:participantId/promote-to-accused` | **Promotes a Suspect to Accused** — updates their role and marks `isAccused: true` on the suspect profile. This affects charge sheet generation and FIR content. |
| `POST` | `/cases/:id/participants/:participantId/sections/attach` | Attaches BNS/BNSS legal sections to a participant (typically suspects/accused). Body: `{ sections: [{ code, title, reason? }] }`. |
| `POST` | `/cases/:id/participants/:participantId/statements` | Records a formal statement for the participant (e.g., recorded during interview). Body: `{ content: string, recordedAt: ISO date string }`. |
| `DELETE` | `/cases/:id/participants/:participantId/statements/:statementId` | Deletes a specific statement record. |
| `POST` | `/cases/:id/participants/:participantId/statements/transcribe` | **Audio-to-text transcription.** Accepts a multipart audio file, sends it to the Python `faster-whisper` service, returns the transcript, detected language, and English translation. The audio file is **never stored** — only the transcript is returned. Body: `file` (multipart, max 50MB). |
| `POST` | `/cases/:id/participants/:participantId/identifiers/upload-signature` | Returns a Cloudinary signed upload signature for uploading an identifier document (Aadhaar scan, photo, etc.) directly to CDN. The file never passes through this server. |
| `POST` | `/cases/:id/participants/:participantId/reasoning` | Adds an investigative reasoning note about this participant (why they are considered a suspect, what evidence links them, etc.). Can be officer-authored or sourced from AI. Body: `{ content: string, source?: "officer"/"ai" }`. |
| `PATCH` | `/cases/:id/participants/:participantId/reasoning/:reasoningId` | Updates an existing reasoning note (e.g., as new evidence changes the picture). Body: `{ content: string }`. |
| `DELETE` | `/cases/:id/participants/:participantId/reasoning/:reasoningId` | Deletes a reasoning note. |

---

## 13. Investigation — Evidence

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/:id/evidence` | Fetches all evidence items attached to the case — including AI-extracted metadata (OCR text, speech transcripts, object tags, GPS data, AI summary, processing status). |
| `POST` | `/cases/:id/evidence` | Adds a new evidence item to the case. Body: `{ type, url/storage_ref, description, cloudinaryPublicId?, ... }`. |
| `POST` | `/cases/:id/evidence/:evidenceId/sections/attach` | Attaches AI-suggested BSA (Bharatiya Sakshya Adhiniyam) legal sections to a specific evidence item. Body: `{ sections: [{ code, title, reason? }] }`. |
| `POST` | `/cases/:id/evidence/:evidenceId/transfer` | Transfers an evidence item (physical or digital) to another police station. Logs the transfer in the custody chain and sends a notification email. Body: `{ targetStationEmail?, manualStationName?, ioChecklistStepId? }`. |

---

## 14. Investigation — Case Diary

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cases/:id/diary` | Fetches all chronological `DiaryEntry` auto-log records for the case (every platform action logged with AI-generated summary). Sorted newest first. |
| `GET` | `/cases/:id/diary/history` | Fetches all **finalized** `CaseDiary` documents — official Roznamcha records with PDF download links (English + Gujarati-English variants). Sorted by diary date. |
| `GET` | `/cases/:id/diary/places` | Returns all places visited during the investigation that have been manually recorded. |
| `POST` | `/cases/:id/diary/draft` | **AI-generates a new diary draft.** Calls Ollama (gemma4:e2b) with the full case context to write a bilingual Roznamcha narrative. Body: `{ diary_date (required), language?, draftLanguage?, title?, officerId?, crimeRegisterNumber?, propertyStolen?, propertyRecovered?, investigationStartTime?, investigationEndTime?, custodyStatus?, magisterialCustodyDate?, lastDiaryNumber?, lastDiaryDate?, structuredData? }`. |
| `PUT` | `/cases/:id/diary/draft/:diaryId` | Updates an editable diary draft before it is finalized. Accepts the same fields as the draft creation endpoint. |
| `POST` | `/cases/:id/diary/finalize` | **Finalizes a diary draft.** Marks the diary as complete, records any `places_visited` included in the draft, and enqueues **PDF generation** via BullMQ for both English and Gujarati-English Roznamcha PDFs. Body: `{ diary_id (required), places_visited?: [], ...same fields as draft }`. |
| `POST` | `/cases/:id/diary/places` | Manually records a location visited during investigation. Body: `{ address, coordinates?, visitDate, startTime?, endTime?, whatWasDone }`. |
| `POST` | `/cases/:id/diary/witnesses` | Records a witness — creates a `CaseParticipant` with the Witness role and logs the statement. Body: `{ name, contact?, statement, evidenceIds?: [] }`. |

---

## 15. Investigation — Escalation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/cases/:id/escalate` | **Manually escalates a case.** Assembles all current case facts, uses Ollama (fast call) to draft a concise 2–3 sentence professional escalation summary, creates an `Escalation` record (status: `pending`), logs a `escalation_raised` diary entry, and enqueues an email to the SHO. Deduplicates — will not create a new escalation if an unresolved one already exists. Body: `{ reason: string }`. |

---

## 16. Charge Sheet

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/cases/:id/chargesheet` | SHO or IO | Fetches the current charge sheet document — assembled from all accused participants (with applied legal sections), all evidence, all department request outcomes, all diary entries, and AI-generated narrative sections. |
| `POST` | `/cases/:id/chargesheet/regenerate` | SHO or IO | **Re-generates the charge sheet using the LLM.** Calls Ollama (deep call, JSON mode) to rewrite the four narrative sections: `briefCaseDescription`, `investigationSummary`, `investigationFindings`, `finalReport`. Overwrites the existing charge sheet. The Annexures section (with CDN links to original documents) is rebuilt automatically. |
| `GET` | `/cases/:id/chargesheet/pdf` | SHO or IO | **Streams the charge sheet as a downloadable PDF** directly in the HTTP response. The PDF is generated on-demand by `PDFKit`, including all case metadata, participants, evidence, legal sections, and direct Cloudinary links to source documents in the annexures. |

---

## 17. Case Closure & IO Recommendation

Case closure is performed via the complaint endpoint. Upon closure:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/complaints/:id/close` | SHO or IO | Closes the case (status: `CLOSED`). After marking the case closed, the backend **fire-and-forgets** a call to the IO Recommendation service. The service embeds the complete case summary (category, location, descriptions, participants, outcomes) via `nomic-embed-text-v2-moe` and upserts the vector into Qdrant, keyed by FIR ID and officer ID. This vector is later used to recommend the most suitable IO when a new, similar case is filed. |

---

## 18. Case Understanding

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/case-understanding/:id` | SHO or IO | Returns the full **9-section Case Understanding** document for a complaint — category, summary, entities, timeline of events, missing information, recommended evidence, evidence analysis, and crime analysis. This data is populated by the Python Complaint Intelligence pipeline. The `:id` can be either the MongoDB `_id` or the `complaintNumber` string. |

---

## 19. Translation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/translation/batch` | Authenticated | **Translates a batch of UI text strings.** Sends the array to Ollama (gemma4:e2b, JSON mode) for translation. Results are cached in Redis — first call for any page/language combination triggers the LLM; subsequent calls are served from cache with near-zero latency. Max 100 strings per request, max 2000 characters each. Body: `{ texts: string[], sourceLanguage: "en"/"hi"/"gu", targetLanguage: "en"/"hi"/"gu" }`. Returns `{ translations: string[] }`. |

---

## 20. Private Case Room (Multiple IO Collaboration)

> Requires SHO or IO auth. Room becomes available only when a case has **≥ 2 assigned IOs**.
> All messages are stored **AES-256-GCM encrypted** in MongoDB and decrypted transparently on retrieval.
> Real-time delivery uses **Socket.io** WebSocket connections authenticated via JWT.

### REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/cases/:id/room/eligibility` | SHO or IO | Checks whether the case room is available. Returns `{ eligible: boolean, ioCount: number }`. A room requires `ioCount ≥ 2`. |
| `GET` | `/cases/:id/room/messages` | SHO or IO | Fetches **paginated message history** for the case room. Messages are decrypted before being returned. Query: `?page=<n>&limit=<n>` (default: page 1, 50 messages per page). Returns `{ messages: CaseRoomMessage[], total: number }`. |
| `POST` | `/cases/:id/room/messages` | SHO or IO | **Sends a message** to the case room. The plaintext is encrypted with AES-256-GCM before storage. Body: `{ content: string }`. The message is simultaneously broadcast to all connected Socket.io clients in the room. |

### Socket.io Events

The Socket.io namespace is `/case-room`. After connecting, clients must join the correct room:

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join_room` | Client → Server | `{ case_id, token }` | Joins the Socket.io room for a case. JWT token is validated on the server — unauthorized connections are rejected. |
| `send_message` | Client → Server | `{ case_id, content }` | Sends a real-time message. Server encrypts, persists, and broadcasts. |
| `new_message` | Server → Client | `CaseRoomMessage` | Broadcast to all room members when a new message arrives (decrypted content). |
| `typing` | Client → Server | `{ case_id, officer_name }` | Notifies room members that this officer is typing. |
| `typing_indicator` | Server → Client | `{ officer_name }` | Broadcast to other clients in the room. |
| `officer_online` | Server → Client | `{ officer_id, officer_name }` | Emitted when an officer joins. |
| `officer_offline` | Server → Client | `{ officer_id }` | Emitted when an officer disconnects. Room locks are cleaned up automatically. |

### Access Control

- Only officers assigned to the case (`assignedIOs` array or `assignedIO`) can join the room.
- SHOs can access room messages via the REST endpoint for oversight.
- If a case has fewer than 2 IOs, the eligibility endpoint returns `eligible: false` and the room is inaccessible.

---

## 21. Prompt Compression Service

> This is an **internal Python FastAPI service** running on port **8005**. It is called by the Node.js backend — not directly by the frontend. Documented here for completeness and service-level debugging.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Liveness probe. Returns `{ status: "ok", model: "microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank" }`. |
| `POST` | `/compress` | None (internal) | **Compresses a text string** using LLMLingua-2. Body: `{ text: string, rate?: number (0.01–0.99, default 0.5), target_token_count?: number, force_tokens?: string[] }`. Returns `{ compressed_text: string, original_tokens: number, compressed_tokens: number, compression_ratio: number }`. |

**Integration in the backend:** The `promptCompressionClient.ts` wraps this service with a 60-second timeout and graceful fallback — if the service is unavailable, the original uncompressed text is passed through to the LLM without any error. The feature is toggled by the `PROMPT_COMPRESSION_ENABLED` environment variable.

**When compression is applied:**
- Case analysis: full investigation text block compressed before being sent to Gemma
- Copilot AGENT mode: complete case facts + legal context compressed
- Department request letters: long case summaries compressed
- Charge sheet narratives: detailed evidence lists compressed

---

## Endpoint Summary

| Group | Endpoints |
|-------|-----------|
| Health | 1 |
| Admin Auth | 3 |
| Admin — Police Stations | 5 |
| Admin — Officers | 5 |
| Admin — Department Registry | 5 |
| Officer Auth | 3 |
| Complaint Filing | 8 |
| SHO Actions | 6 |
| Investigation — AI Analysis | 7 |
| Investigation — Copilot | 1 |
| Investigation — Checklist | 3 |
| Investigation — Dept Requests & Threads | 10 |
| Investigation — Citizen Requests | 2 |
| Citizen Request Portal (public) | 2 |
| Case Participants | 13 |
| Evidence | 4 |
| Case Diary | 8 |
| Escalation | 1 |
| Charge Sheet | 3 |
| Case Closure | 1 |
| Case Understanding | 1 |
| Translation | 1 |
| Private Case Room (REST) | 3 |
| Prompt Compression Service (internal) | 2 |
| **Total** | **~108** |

---

*Crime OS — Built for Gujarat Police | SVNIT*

---

## Physical Evidence API

Endpoints for tracking physical evidence items, Malkhana storage, and the cryptographic chain of custody.

### 1. Create Physical Evidence

`POST /api/v1/physical-evidence/cases/:id/physical-evidence`

Registers a newly seized physical item into the system.

**Request Body (example)**
```json
{
  "itemName": "Glock 19",
  "category": "WEAPON",
  "description": "9mm handgun found at the scene",
  "conditionOnSeizure": "Loaded, safety off",
  "seizureMemoNo": "SM-9092",
  "seizureLocation": "Alleyway behind bank",
  "sealNumber": "S-99120"
}
```

**Response (201 Created)**
```json
{
  "status": "success",
  "message": "Physical Evidence logged successfully",
  "data": {
    "evidenceTagId": "PEV-2026-00491",
    "status": "SEIZED",
    "custodyChain": [...]
  }
}
```

### 2. Get Physical Evidence by Case

`GET /api/v1/physical-evidence/cases/:id/physical-evidence`

Returns all physical items linked to a specific case.

### 3. Initiate Dispatch

`POST /api/v1/physical-evidence/:id/dispatch`

Initiates a custody transfer (e.g., from IO to Malkhana, or Malkhana to FSL).

### 4. Acknowledge Receipt

`POST /api/v1/physical-evidence/:id/acknowledge`

Receiving officer accepts the item and completes the cryptographic custody node.

### 5. Verify Chain Integrity

`GET /api/v1/physical-evidence/:id/verify`

Recalculates the hashes of the custody chain to prove no tampering has occurred.

---

## Case Graph API

Endpoints for retrieving the relationship graph for a case.

### 1. Get Case Knowledge Graph

`GET /api/v1/cases/:id/graph`

Dynamically builds and returns the entity-participant-evidence graph for visualization.

**Response (200 OK)**
```json
{
  "status": "success",
  "data": {
    "nodes": [
      { "id": "60d5ec...", "label": "John Doe", "nodeType": "participant" }
    ],
    "edges": [
      { "from": "60d5ec...", "to": "50c4db...", "relationship": "shared_identifier" }
    ]
  }
}
```
