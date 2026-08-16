# Crime OS — Database Schema

> All collections use MongoDB. Schemas are defined with Mongoose. Every collection (except `DiaryEntry`) uses `timestamps: true` (`createdAt` / `updatedAt` auto-managed). `versionKey: false` throughout.

---

## Table of Contents

1. [Shared Sub-Schemas](#1-shared-sub-schemas)
2. [Admin](#2-admin)
3. [PoliceStation](#3-policestation)
4. [Officer](#4-officer)
5. [User (Citizen)](#5-user-citizen)
6. [DepartmentRegistry](#6-departmentregistry)
7. [Complaint](#7-complaint)
8. [Evidence](#8-evidence)
9. [CaseChecklist](#9-casechecklist)
10. [AnalysisSnapshot](#10-analysissnapshot)
11. [CaseParticipant](#11-caseparticipant)
12. [DepartmentRequest](#12-departmentrequest)
13. [RequestThread](#13-requestthread)
14. [CaseDiary](#14-casediary)
15. [DiaryEntry](#15-diaryentry)
16. [PlaceVisited](#16-placevisited)
17. [CaseEntity](#17-caseentity)
18. [ChargeSheet](#18-chargesheet)
19. [Escalation](#19-escalation)
20. [CaseRoomMessage](#20-caseroommessage)
21. [Collection Relationships](#21-collection-relationships)

---

## 1. Shared Sub-Schemas

These embedded sub-schemas are reused across multiple collections.

### LegalSectionSuggestion
AI-suggested or manually selected legal section. Used wherever sections are recommended but not yet formally applied.

| Field | Type | Description |
|-------|------|-------------|
| `code` | String | Section identifier, e.g. `BNS-302` |
| `title` | String | Human-readable section title |
| `reason` | String? | Why this section applies to the case |

### AppliedLegalSection
Extends `LegalSectionSuggestion`. Used when an officer formally attaches a section.

| Field | Type | Description |
|-------|------|-------------|
| `code` | String | — |
| `title` | String | — |
| `reason` | String? | — |
| `attachedBy` | ObjectId → Officer | Officer who applied this section |
| `attachedAt` | Date | Timestamp of attachment |

---

## 2. Admin

Collection: `admins` — Platform administrator accounts. Admin has no access to investigation data.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `username` | String | unique, lowercase | Admin login username |
| `password` | String | select: false | Bcrypt-hashed password |

---

## 3. PoliceStation

Collection: `policestations` — Gujarat Police stations managed on the platform.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `name` | String | required | Full station name |
| `code` | String | unique, uppercase | Short immutable station code (e.g. `GJ-AHM001`) |
| `address` | String | required | Street address |
| `city` | String | required | — |
| `district` | String | required | — |
| `state` | String | default: `Gujarat` | — |
| `pincode` | String | required | — |
| `phone` | String | required | — |
| `email` | String | optional, lowercase | — |
| `isActive` | Boolean | default: true | Soft toggle — inactive stations are hidden from dropdowns |

**Note:** Any write to this collection automatically invalidates the Redis stations-list cache.

---

## 4. Officer

Collection: `officers` — SHO and IO accounts. Created only by admin; no self-registration.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `officerName` | String | required | — |
| `badgeNumber` | String | unique, uppercase | Police badge number — immutable identifier |
| `email` | String | unique, lowercase | Login email |
| `phone` | String | required | — |
| `role` | String | enum: `SHO`, `IO` | Determines access permissions throughout the system |
| `policeStation` | ObjectId → PoliceStation | required | Station this officer belongs to |
| `isActive` | Boolean | default: true | Deactivated officers cannot log in |
| `password` | String | select: false | Bcrypt-hashed |

---

## 5. User (Citizen)

Collection: `users` — Citizen profiles (legacy; not used in current officer-only flow but kept for reference).

| Field | Type | Description |
|-------|------|-------------|
| `firstName`, `middleName`, `lastName` | String | Full name |
| `username` | String? | Optional unique handle (sparse index) |
| `email` | String | Login email |
| `phone` | String | — |
| `password` | String | Bcrypt-hashed, select: false |
| `dateOfBirth` | Date | — |
| `gender` | String | enum: `male`, `female`, `other` |
| `address`, `city`, `district`, `state`, `pincode` | String | Full address |
| `idProofType` | String | enum: Aadhaar, PAN, Passport, VoterID, DrivingLicense |
| `idProofNumber` | String | Government ID number |
| `securityQuestion` | String? | For account recovery |
| `securityAnswer` | String? | select: false |
| `isEmailVerified` | Boolean | Account is inactive until email is verified via OTP |

---

## 6. DepartmentRegistry

Collection: `departmentregistries` — External agencies the IO can send formal information requests to (banks, telecom, forensic labs, courts, etc.).

| Field | Type | Description |
|-------|------|-------------|
| `entity_id` | String | Unique short identifier used as a foreign key throughout the system |
| `entity_name` | String | Full display name |
| `category` | String | Department category (e.g. `Bank`, `Telecom`, `Forensic`) |
| `what_they_can_provide` | String[] | List of information types this department can supply |
| `legal_basis_typically_cited` | String[] | BNSS/IPC sections typically cited when requesting from this department |
| `request_format_expected` | String | Format preference of the department |
| `typical_response_time` | String | e.g. `7-10 working days` |
| `escalation_path_if_no_response` | String | What to do if the department doesn't respond |
| `notes_or_caveats` | String | Special notes for the IO when making a request |
| `confidence` | String | enum: `high`, `medium`, `low` — reliability rating of this department |
| `contact_email` | String? | Email address where request letters are sent |
| `qdrant_uuid` | String? | Qdrant point UUID — set on first embed; used for targeted vector update/delete |
| `isActive` | Boolean | Inactive departments are hidden from the request composer and removed from Qdrant |

---

## 7. Complaint

Collection: `complaints` — Central record for each complaint filed. The primary document linking all investigation data.

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `complaintNumber` | String | UUID-based unique identifier shown to officers (e.g. `COMP-a3f7...`) |
| `status` | String | Lifecycle state: `SUBMITTED` → `UNDER_REVIEW` → `ASSIGNED_TO_IO` → `FIR_REGISTERED` → `CLOSED` (or `REJECTED`) |
| `citizen` | ObjectId → User | Complainant reference |
| `policeStation` | ObjectId → PoliceStation | Station where the complaint was filed |
| `assignedSHO` | ObjectId → Officer | SHO handling this complaint |
| `assignedIO` | ObjectId → Officer | IO assigned to investigate |
| `incidentDate` | Date | When the incident occurred |
| `incidentTime` | String? | Time of incident (optional, in addition to date) |
| `incidentPlace` | String | Location description |
| `approximateDateText` | String? | Plain-language date if exact date unknown (e.g. "sometime last Tuesday") |
| `coordinates` | String? | GPS coordinates of incident |
| `category` | String? | enum from `ComplaintCategory` — official Gujarat Police crime category |
| `crimeCategory` | String? | Free-text category override or supplemental label |
| `shortDescription` | String | One-line summary (max 255 chars) |
| `detailedDescription` | String | Full account of the incident |
| `currentVersionNumber` | Number | Increments with each IO edit to the complaint |

### History Arrays

Each stores a versioned audit trail of edits. Every entry has: `version` (Number), `editedBy` (`Citizen`/`SHO`/`IO`), `editorId`, `content`, `timestamp`.

| Field | Tracks |
|-------|--------|
| `descriptionHistory` | Changes to the detailed description |
| `crimeSummaryHistory` | AI or officer crime summary revisions |
| `legalSectionsHistory` | Changes to applied legal sections |
| `investigationNotesHistory` | IO investigation notes revisions |

### Evidence Sub-documents

`evidence[]` — Each uploaded file embedded directly on the complaint:

| Field | Description |
|-------|-------------|
| `publicId` | Cloudinary public ID |
| `secureUrl` | Cloudinary HTTPS URL |
| `resourceType`, `mimeType`, `extension` | File type metadata |
| `originalFilename`, `size` | — |
| `uploadedBy` | ObjectId → User |
| `processingStatus` | `PENDING` / `PROCESSED` / `FAILED` — updated by the Python pipeline |
| `applicableSections[]` | Legal sections attached to this specific file |
| `aiMetadata` | Full AI extraction output (OCR text, speech transcript, image tags, object detection, faces, GPS/EXIF, AI summary, classification + confidence, dimensions) |
| `isPhysical` | True for physically seized items |
| `physicalDetails` | `name`, `description`, `locationFound`, `currentLocation` — for physical items |

### FIR Fields

| Field | Description |
|-------|-------------|
| `firNumber` | Unique FIR number assigned on registration (sparse unique index) |
| `firRegisteredAt`, `firRegisteredBy` | When and by whom the FIR was registered |
| `firPdfUrlEn` | Cloudinary URL of the English FIR PDF |
| `firPdfUrlGujEn` | Cloudinary URL of the bilingual Gujarati-English FIR PDF |
| `firPdfUrl` | Legacy single PDF URL (kept for backward compatibility) |
| `firFormData` | Cached JSON of the 15-section FIR form for SHO editing before finalization |

### Status Timestamps

`rejectionReason`, `rejectedAt`, `approvedAt`, `assignedAt`, `investigationStartedAt`

### AI Intelligence

`complaintIntelligence` — Populated by the Python Complaint Intelligence pipeline:

| Sub-field | Description |
|-----------|-------------|
| `category` | AI-classified crime category |
| `summary` | AI-written case summary |
| `entities[]` | Extracted people, organisations, accounts (name + type) |
| `timeline[]` | Reconstructed chronological event sequence |
| `people_and_entities` | Structured entity breakdown |
| `evidence_analysis[]` | Per-evidence AI analysis |
| `crime_analysis` | Overall crime type analysis |
| `missing_information[]` | Information the AI identified as absent from the complaint |
| `missing_evidence[]` | Evidence types the AI recommends collecting |
| `sections` | Legal section mapping from the intelligence pipeline |

### Other

| Field | Description |
|-------|-------------|
| `processingStatus` | Overall pipeline status for this complaint |
| `timeline[]` | Manual event timeline (user, timestamp, description, metadata) |
| `auditLogs[]` | Security audit log: actor, IP, action, old/new values, timestamp |
| `isDeleted` | Soft-delete flag |

**Indexes:** `status`, `citizen`, `policeStation`, `assignedIO`

---

## 8. Evidence

Collection: `evidences` — Detailed evidence records created by the investigation module (separate from the embedded evidence on `Complaint`). Enriched by the Python AI pipeline after upload.

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `evidence_id` | String | UUID — unique identifier |
| `type` | String | `image`, `audio`, `video`, `document`, `physical_device`, etc. |
| `storage_ref` | String | Cloudinary public_id or storage key |
| `ai_description` | String? | Short AI-generated caption |
| `ai_tags` | String[] | Quick-access keyword tags |
| `uploader_id` | ObjectId → Officer | — |
| `status` | String | enum: `pending`, `verified`, `rejected` |
| `source` | String? | Who provided it: `complainant`, `io_officer`, `department`, `cyber_analyst` |
| `origin` | String? | `post_complaint_request` — marks evidence uploaded by a citizen via token link |
| `linked_diary_entry_id` | String? | Diary entry where this evidence was first recorded |
| `linked_request_id` | String? | Department/citizen request this evidence came from |
| `relatedParticipantIds` | ObjectId[] → CaseParticipant | Participants this evidence is linked to |
| `applicableSections` | LegalSectionSuggestion[] | BSA sections attached to this evidence |
| `processingStatus` | String | `PENDING` / `PROCESSED` / `FAILED` — set by the Python pipeline |
| `originalFilename`, `mimeType`, `size` | — | — |

### Physical Evidence

| Field | Description |
|-------|-------------|
| `is_physical` | True for physically seized items |
| `current_location` | Where the item is currently held (default: `malkhana`) |
| `custody_chain[]` | Full transfer history — each entry: `timestamp`, `from_entity`, `to_entity`, `status` (`dispatched`/`received`/`in_transit`/`returned`), `proof_storage_ref`, `notes` |

### AI Metadata

`aiMetadata` — Populated by the Python Complaint Intelligence pipeline:

| Sub-field | Description |
|-----------|-------------|
| `ocrText` | Text extracted from images/scanned PDFs via PaddleOCR |
| `speechTranscript` | Audio transcription from faster-whisper |
| `pdfText` | Text extracted from digital PDFs via PyMuPDF |
| `imageTags` | Florence-2 keyword tags |
| `detectedObjects` | Objects identified by Florence-2 |
| `faces` | Face detection results |
| `embeddings` | Vector embedding of the evidence content |
| `virusScanResult` | Malware scan outcome |
| `aiSummary` | Paragraph summary of what the evidence contains |
| `classification` | AI-assigned evidence category |
| `classificationConfidence` | Confidence score (0.0–1.0) |
| `width`, `height` | Image/video dimensions in pixels |
| `fileType` | MIME-level type detection |
| `exif` | EXIF metadata (camera, timestamps, device info) |
| `gps` | GPS coordinates extracted from file metadata |
| `processingErrors` | Any errors during pipeline processing |

### Deepfake Detection

| Field | Type | Description |
|-------|------|-------------|
| `confidence_score` | Number (0–100) | **AI Deepfake Confidence Score** populated by the SightEngine API. Ranges: `0–30` = Likely Real, `30–70` = Uncertain (manual review recommended), `70–100` = Likely AI-Generated/Manipulated. Defaults to `0` if detection is disabled or unavailable. Stored on the top-level evidence document, not inside `aiMetadata`. |

### Encryption

The `Evidence` collection uses the **`evidenceEncryptionPlugin`** (Mongoose plugin) which automatically encrypts sensitive fields using **AES-256-GCM** before persistence and decrypts them transparently on read. The following fields are encrypted at rest:

`storage_ref`, `ai_description`, `ai_tags`, `current_location`, `custody_chain`, `originalFilename`, `aiMetadata.ocrText`, `aiMetadata.speechTranscript`, `aiMetadata.pdfText`, `aiMetadata.imageTags`, `aiMetadata.detectedObjects`, `aiMetadata.faces`, `aiMetadata.embeddings`, `aiMetadata.aiSummary`, `aiMetadata.exif`, `aiMetadata.gps`

| Field | Description |
|-------|-------------|
| `isEncrypted` | Boolean flag. Set to `true` automatically by the plugin pre-save hook. Used by the post-find hook to decide whether decryption is needed. |

**Indexes:** `(case_id, status)`, `(case_id)` (primary lookup)

---

## 9. CaseChecklist

Collection: `casechecklists` — Investigation steps auto-generated from SOPs when a case is assigned, plus any manually added steps.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `sop_id` | String | ID of the SOP this step came from |
| `step_id` | String | UUID — unique step identifier |
| `title` | String | Step description |
| `status` | String | enum: `pending`, `blocked`, `in_progress`, `completed` |
| `criticality` | String | enum: `high`, `medium`, `low` — used in confidence score weighting (high=3, medium=2, low=1) |
| `required_evidence` | String[] | Description of what evidence this step requires |
| `proof_evidence_ids` | String[] | Evidence IDs that have been attached to satisfy this step |
| `locked_by_request_id` | String? | Set when a department/citizen request is sent; step stays `blocked` until response arrives |
| `department_entity_id` | String? | Which external department this step involves |
| `target` | String? | Free-text target (person, organisation) for this step |
| `completed_by` | ObjectId → Officer | — |
| `completed_at` | Date | — |

**Indexes:** `(case_id, status)`, `(case_id, sop_id)`

---

## 10. AnalysisSnapshot

Collection: `analysissnapshots` — A versioned record of the AI's analysis of the case at a specific point in time. New snapshots are created on each analysis run; old ones are preserved for audit.

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `snapshot_id` | String | UUID — unique per snapshot |
| `timestamp` | Date | When this snapshot was created |
| `trigger` | String | What caused this run: `manual`, `auto_on_complaint_filed`, `auto_on_response`, `officer_override` |
| `facts_used` | Mixed | The exact assembled facts object fed to the LLM — preserved for audit/diff |
| `narrative_summary` | String | Markdown narrative written by the LLM summarising the case state |
| `confidence_breakdown` | Mixed | All confidence scoring components (evidence coverage, checklist progress, corroboration) |
| `officer_authored` | Boolean | True if this snapshot was created manually by an officer without LLM involvement |
| `parent_snapshot_id` | String? | Links to the previous snapshot — forms a chain for correction/diff tracking |

### Recommendation Arrays

**`ranked_next_steps[]`** — Actions the AI recommends the IO take next:

| Sub-field | Description |
|-----------|-------------|
| `step_id` | Unique identifier for this recommended step |
| `reason` | Why this step is recommended |
| `confidence` | 0.0–1.0 |
| `evidence_needed[]` | What evidence to collect for this step |
| `target` | Person or entity to focus on |
| `department_entity_id` | Department to contact for this step |

**`suspect_candidates[]`** — Persons identified as potential suspects:

| Sub-field | Description |
|-----------|-------------|
| `entity` | Name or description |
| `confidence` | 0.0–1.0 |
| `supporting_evidence_ids[]` | Evidence that points to this person |
| `contradicting_evidence_ids[]` | Evidence that counts against this person |
| `recommended_sections[]` | LegalSectionSuggestion[] — BNS sections for this suspect |

**`participant_recommendations[]`** — Suggested case participants (more detailed than suspects):

| Sub-field | Description |
|-----------|-------------|
| `name` | — |
| `roles[]` | `Victim`, `Witness`, `Suspect`, `Accused`, `Complainant` |
| `confidence` | 0.0–1.0 |
| `reason` | AI's reasoning for this recommendation |
| `supporting_evidence_ids[]` | — |
| `contradicting_evidence_ids[]` | — |
| `recommended_sections[]` | Legal sections with `reason` per section |
| `suggested_reasoning` | AI-written reasoning text that can be attached to the participant |

**`evidence_section_recommendations[]`** — Per-evidence legal section suggestions:

| Sub-field | Description |
|-----------|-------------|
| `evidence_id` | — |
| `evidence_title` | Display name of the evidence |
| `applicable_sections[]` | LegalSectionSuggestion[] — BSA sections for this evidence item |

**`suggested_legal_sections[]`** — Case-level BNS/BNSS/BSA sections as LegalSectionSuggestion[]

**Indexes:** `(case_id, timestamp desc)` — most recent snapshot is the primary query

---

## 11. CaseParticipant

Collection: `caseparticipants` — All people formally connected to a case: victims, witnesses, suspects, accused, complainants.

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `participant_id` | String | UUID — unique identifier |
| `name` | String | Full name |
| `contact` | Object? | `phone`, `email`, `address` |
| `identifiers[]` | — | Govt IDs, phone numbers, etc. |
| `roles[]` | String[] | enum: `Victim`, `Witness`, `Suspect`, `Accused`, `Complainant` |
| `statements[]` | — | Formal recorded statements |
| `reasoning[]` | — | Investigative reasoning notes |

### Identifiers Sub-document

| Field | Description |
|-------|-------------|
| `type` | e.g. `Aadhaar`, `PAN`, `phone`, `IMEI` |
| `value` | The actual identifier value |
| `fileUrl` | Cloudinary URL of an uploaded supporting document (scan, photo) |

### Statements Sub-document

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `content` | Full text of the statement (typed or auto-transcribed from audio) |
| `recordedAt` | Timestamp of when the statement was given |

### Reasoning Sub-document

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `content` | Investigative reasoning text — editable, can evolve as case progresses |
| `source` | `officer` (manually written) or `ai` (from analysis snapshot) |
| `createdAt` | — |

### Role-Specific Profiles

**`victimProfile`**
| Field | Description |
|-------|-------------|
| `injuryDetails` | Physical/psychological injuries |
| `lossDetails` | Financial or property losses |

**`witnessProfile`**
| Field | Description |
|-------|-------------|
| `evidenceIds[]` | Evidence items this witness is linked to |

**`suspectProfile`**
| Field | Description |
|-------|-------------|
| `appliedSections[]` | AppliedLegalSection[] — BNS sections formally attached to this suspect |
| `isAccused` | Set to true when the suspect is promoted to Accused |

**`complainantProfile`**
| Field | Description |
|-------|-------------|
| `relationshipToIncident` | e.g. "Direct victim", "Relative of victim" |

**Indexes:** `(case_id, roles)`, `(case_id, name)`, `(case_id, identifiers.value)`

---

## 12. DepartmentRequest

Collection: `departmentrequests` — Formal information request letters sent by the IO to external departments or citizens.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `request_id` | String | UUID — unique identifier |
| `step_id` | String | Checklist step this request is linked to |
| `request_type` | String | `external_department`, `inter_station_assignment`, `citizen_request` |
| `recipient_type` | String | Category of recipient (e.g. `Bank`, `Telecom`, `citizen`) |
| `department_entity_id` | String? | References DepartmentRegistry — not set for citizen requests |
| `draft_content` | String | Full text of the AI-drafted letter |
| `attachments[]` | String[] | Evidence IDs attached to this request |
| `status` | String | Lifecycle: `draft` → `reviewed` → `sent` → `acknowledged` → `response_received` → `overdue` |
| `sent_via` | String? | `email` or `portal_mock` |
| `sent_at` | Date? | When the email was dispatched |
| `response_ref` | String? | Storage ref or text of the received response |
| `response_at` | Date? | When the response was received |
| `token` | String? | One-time secure token embedded in the citizen's email link |
| `token_expires_at` | Date? | Expiry of the citizen token |

**Indexes:** `(case_id, status)`, `(case_id, step_id)`

---

## 13. RequestThread

Collection: `requestthreads` — Conversation thread between the IO and a department or citizen, attached to a `DepartmentRequest`.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `request_id` | String | Matches `DepartmentRequest.request_id` — one thread per request |
| `department_entity_id` | String? | Department entity (null for citizen threads) |
| `step_title` | String | Title of the checklist step this thread belongs to |
| `request_type` | String | Same enum as DepartmentRequest |
| `recipient_type` | String | — |
| `unread_by_io` | Boolean | Set true when a department/citizen reply arrives; cleared when IO opens the thread |
| `messages[]` | — | Full conversation history |

### ThreadMessage Sub-document

| Field | Description |
|-------|-------------|
| `sender` | `io`, `department`, or `citizen` |
| `content` | Message text |
| `timestamp` | — |
| `attachments[]` | Evidence IDs attached to this message |

---

## 14. CaseDiary

Collection: `casediaries` — Official Roznamcha (case diary) documents. One per diary session; multiple diaries can exist per case.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `diary_id` | String | UUID |
| `diary_date` | Date | The date this diary entry covers |
| `diary_number` | Number | Sequential diary number for this case |
| `title` | String | — |
| `status` | String | `draft` → `completed` → `finalized` |
| `generated_by` | String | `ai` or `officer` |
| `content` | Mixed | Raw AI-generated content object |
| `places_visited[]` | String[] | Addresses of places visited (plain text list for display) |
| `place_visited_ids[]` | ObjectId[] → PlaceVisited | References to structured PlaceVisited records |
| `language_preference` | String? | Officer's UI language at time of generation |
| `draft_language` | String? | Language of the written narrative: `guj_en` or `en` |
| `official_officer_id` | String? | Officer ID as it appears on the official Roznamcha |
| `crime_register_number` | String? | Station crime register number |
| `property_stolen` | String? | Description of stolen property |
| `property_recovered` | String? | Description of recovered property |
| `record_of_investigation` | String? | Raw mixed-language investigation narrative |
| `record_of_investigation_guj_en` | String? | Gujarati-English bilingual narrative |
| `record_of_investigation_en` | String? | English-only narrative |
| `structured_data` | Mixed? | Parsed tabular data (e.g. bank accounts, transaction layers) |
| `pdf_url`, `pdf_url_guj_en`, `pdf_url_en` | String? | Cloudinary URLs for generated PDFs (default / Gujarati-English / English) |
| `cloudinary_id`, `cloudinary_id_guj_en`, `cloudinary_id_en` | String? | Cloudinary public IDs for each PDF variant |
| `investigation_start_time`, `investigation_end_time` | String? | HH:MM times of investigation session |
| `custody_status` | String? | Current custody status of suspects |
| `magisterial_custody_date` | String? | Date of magisterial custody remand |
| `last_diary_number`, `last_diary_date` | Number/String? | Reference to the previous diary entry |

---

## 15. DiaryEntry

Collection: `diaryentries` — **Append-only** auto-log of every meaningful event that occurs in the system. The backbone of the automated case diary. Every platform action that matters is written here automatically.

> **Enforcement:** Schema-level `pre` hooks throw an error on any `updateOne`, `findOneAndUpdate`, or delete operation. Records are immutable once created.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `entry_id` | String | UUID |
| `timestamp` | Date | Exact time of the event (not auto-managed — explicitly set) |
| `actor.type` | String | Who triggered the event: `officer`, `system`, `department` |
| `actor.id` | String | Officer ID, system identifier, or department entity ID |
| `event_type` | String | One of ~28 enum values covering every trackable action (see below) |
| `payload` | Mixed | Event-specific data — varies by `event_type` |
| `ref_ids` | Object | Optional cross-references: `evidence_id`, `request_id`, `step_id`, `participant_id`, `snapshot_id` |

### Event Types

| Category | Event Types |
|----------|-------------|
| Filing | `complaint_filed` |
| Evidence | `evidence_added`, `evidence_sections_attached` |
| Checklist | `checklist_step_completed`, `manual_step_added` |
| Requests | `request_drafted`, `request_sent`, `response_received` |
| Analysis | `analysis_run`, `suggestion_generated`, `override_correction` |
| Participants | `participant_recommendation_approved`, `participant_added_manually`, `participant_updated`, `participant_deleted`, `participant_sections_attached`, `participant_promoted_to_accused`, `participant_statement_added`, `participant_reasoning_attached`, `participant_identifier_uploaded` |
| Diary | `diary_draft_generated`, `diary_finalized`, `case_diary_draft_created`, `case_diary_completed`, `place_visited_added`, `witness_added` |
| Other | `officer_note`, `escalation_raised` |

**Indexes:** `(case_id, timestamp asc)`, `(case_id, event_type)`

---

## 16. PlaceVisited

Collection: `placesvisited` — Locations visited by the IO during investigation. Used in Case Diary generation.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `place_id` | String | UUID |
| `address` | String | Full address |
| `coordinates` | Object? | `lat`, `lng` — GPS coordinates |
| `visit_date` | Date | — |
| `start_time`, `end_time` | String? | HH:MM visit window |
| `what_was_done` | String? | What the officer did at this location |
| `added_by` | String? | Officer ID who recorded this visit |
| `source` | String? | How this record was created (e.g. `diary_finalization`) |
| `event_type` | String? | Classification of visit (e.g. `crime_scene`, `witness_location`) |

---

## 17. CaseEntity

Collection: `caseentities` — Distinct entities (phone numbers, bank accounts, UPI IDs, IMEIs, names) extracted and tracked across a case.

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `entity_type` | String | e.g. `phone`, `account`, `upi`, `imei`, `name` |
| `value` | String | The actual extracted value |
| `first_seen_entry_id` | String | DiaryEntry `entry_id` where this entity was first noted — for traceability |
| `corroborating_evidence_ids[]` | String[] | Evidence IDs that mention or corroborate this entity |

**Indexes:** `(case_id, entity_type)`, `(case_id, value)`

---

## 18. ChargeSheet

Collection: `chargesheets` — Final legal document assembled from all case artifacts. Multiple versions can exist per case.

### Participant References

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `victimIds[]` | ObjectId[] → CaseParticipant | — |
| `witnessIds[]` | ObjectId[] → CaseParticipant | — |
| `accusedIds[]` | ObjectId[] → CaseParticipant | Participants with `suspectProfile.isAccused = true` |
| `suspectIds[]` | ObjectId[] → CaseParticipant | Remaining suspects not yet formally accused |

### Legal Sections

| Field | Description |
|-------|-------------|
| `applicableLegalSections[]` | Case-level LegalSectionSuggestion[] — overall sections for the case |
| `appliedSectionsByAccused[]` | Per-accused sections — each entry: `accusedId` (ObjectId) + `sections[]` (AppliedLegalSection[]) |

### Evidence & Records

| Field | Description |
|-------|-------------|
| `evidenceIds[]` | All Evidence records included in this charge sheet |
| `departmentRequestIds[]` | All DepartmentRequest records (responses included via ref) |
| `diaryEntryIds[]` | All DiaryEntry records forming the investigation log |
| `investigationSummarySnapshotId` | ObjectId → AnalysisSnapshot — the snapshot used as basis for the AI narratives |

### AI-Generated Narratives (all editable before filing)

| Field | Description |
|-------|-------------|
| `briefCaseDescription` | Short summary of the case |
| `investigationSummary` | Overview of how the investigation was conducted |
| `investigationFindings` | Key findings and evidence analysis |
| `finalReport` | Conclusions and recommendations for court |

### Filing Metadata

| Field | Description |
|-------|-------------|
| `filingMetadata.status` | `draft` → `ready_for_review` → `filed` → `returned` |
| `filingMetadata.filingNumber` | Court filing reference number |
| `filingMetadata.courtName` | Name of the court where the charge sheet is filed |
| `filingMetadata.filedAt` | Date of filing |
| `filingMetadata.filedBy` | ObjectId → Officer |
| `filingMetadata.notes` | Additional notes |

| Field | Description |
|-------|-------------|
| `version` | Version number — increments with each regeneration (v1, v2, …) |

**Unique index:** `(case_id, version)`

---

## 19. Escalation

Collection: `escalations` — Records of case escalations (both manual and auto-triggered by the orchestrator).

| Field | Type | Description |
|-------|------|-------------|
| `case_id` | ObjectId → Complaint | — |
| `escalation_id` | String | UUID |
| `reason` | String | IO's stated reason or auto-detected condition (e.g. "stalled — no new evidence in 3 runs") |
| `triggered_at` | Date | — |
| `summary` | String | AI-written 2–3 sentence professional escalation summary (generated by Ollama fast call) |
| `sent_to` | String | Recipient — SHO badge/ID or department name |
| `status` | String | `pending` → `sent` → `resolved` |

**Note:** The orchestrator checks for an unresolved escalation before creating a new one — deduplication prevents spam escalations on the same stalled case.

**Index:** `(case_id, status)`

---

## 20. CaseRoomMessage

Collection: `caseroommessages` — Encrypted real-time chat messages exchanged between IOs (and SHOs) within a case's Private Chatroom. Used by the Multiple IO Collaboration feature.

> **Immutability:** Messages are never edited or deleted after creation. The room is only accessible when the case has ≥ 2 assigned IOs.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `case_id` | ObjectId → Complaint | required, indexed | The case this message belongs to |
| `message_id` | String | unique, default: `uuidv4()` | UUID — unique identifier for the message |
| `sender_id` | ObjectId → Officer | required | Officer who sent the message |
| `sender_name` | String | required, trimmed | Display name of the sender (denormalized for quick display) |
| `content` | String | required | AES-256-GCM encrypted ciphertext. Format: `enc:<iv>:<ciphertext>:<authTag>`. Decrypted transparently by `CaseRoomService.getMessages()` before returning to the client. |
| `isEncrypted` | Boolean | default: `true` | Always `true` — indicates the `content` field is stored encrypted |
| `sent_at` | Date | default: `Date.now` | Precise timestamp of when the message was sent |

**Indexes:** `(case_id)` (primary lookup), `(case_id, sent_at asc)` (chronological message retrieval)

**Encryption Detail:** The `CaseRoomService.saveMessage()` method calls `encryptValue(plaintext)` before `CaseRoomMessage.create()`. The `encryptValue` utility uses **AES-256-GCM** with a random IV per message, producing the format `enc:<iv_hex>:<ciphertext_hex>:<authTag_hex>`. The `decryptValue` utility reverses this in `CaseRoomService.getMessages()`.

**Pagination:** `getMessages()` accepts `page` and `limit` parameters (default: `limit=50`). Messages are sorted ascending by `sent_at` so the oldest appear first in the history.

---

## 21. Collection Relationships

```
Admin                  (standalone)
PoliceStation          (standalone)
Officer                → PoliceStation
User                   (standalone)
DepartmentRegistry     (standalone — vectors synced to Qdrant)

Complaint              → User (citizen)
                       → PoliceStation
                       → Officer (assignedSHO, assignedIO, assignedIOs[], firRegisteredBy)

Evidence               → Complaint (case_id)
                       → Officer (uploader_id)
                       → CaseParticipant[] (relatedParticipantIds)

CaseChecklist          → Complaint (case_id)
                       → Officer (completed_by)

AnalysisSnapshot       → Complaint (case_id)
                       ← AnalysisSnapshot (parent_snapshot_id — self-reference for correction chain)

CaseParticipant        → Complaint (case_id)
                       → Evidence[] (witnessProfile.evidenceIds)
                       → Officer (suspectProfile.appliedSections[].attachedBy)

DepartmentRequest      → Complaint (case_id)

RequestThread          → Complaint (case_id)
                       ← DepartmentRequest (request_id — 1:1 match)

CaseDiary              → Complaint (case_id)
                       → PlaceVisited[] (place_visited_ids)

DiaryEntry             → Complaint (case_id)
                       (append-only — no FK enforcement, refs stored as strings in ref_ids)

PlaceVisited           → Complaint (case_id)

CaseEntity             → Complaint (case_id)

ChargeSheet            → Complaint (case_id)
                       → CaseParticipant[] (victims, witnesses, accused, suspects)
                       → Evidence[]
                       → DepartmentRequest[]
                       → DiaryEntry[]
                       → AnalysisSnapshot (investigationSummarySnapshotId)
                       → Officer (filedBy)

Escalation             → Complaint (case_id)

CaseRoomMessage        → Complaint (case_id)   ← Private Chatroom messages
                       → Officer (sender_id)
```

---

*Crime OS — Built for Gujarat Police | SVNIT*
