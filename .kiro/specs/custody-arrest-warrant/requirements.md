# Requirements Document

## Introduction

The Custody & Arrest Warrant feature extends the Crime OS AI investigation workspace to support the full legal lifecycle of arresting a suspect or accused person. An Investigating Officer (IO) drafts an arrest warrant following the BNSS/CrPC Form No. 2 template, submits it digitally to the Court/Magistrate Office via email (using the existing GmailService), waits for the magistrate's approval or rejection (ingested by the existing GmailPollWorker), and then executes the arrest. Once the person is taken into custody, a 24-hour BNSS Section 57 compliance timer starts, after which the IO and SHO are alerted to produce the accused before a magistrate.

All custody lifecycle events are recorded as DiaryEntry documents and the existing RequestThread/DepartmentRequest patterns are reused for the magistrate communication channel.

## Glossary

- **IO**: Investigating Officer — the police officer assigned to investigate a complaint.
- **SHO**: Station House Officer — the officer in charge of the police station.
- **ArrestWarrant**: The primary MongoDB document (also called CustodyRecord) that stores the complete lifecycle of one warrant: drafting, magistrate review, arrest, custody, and court production.
- **Warrant_Service**: The backend service responsible for creating, updating, and managing ArrestWarrant documents and their lifecycle transitions.
- **Custody_Panel**: The frontend "Custody" tab added to InvestigationWorkspace that the IO uses to manage warrants.
- **GmailService**: The existing shared service that sends emails via the police Gmail OAuth2 account and attaches PDF files.
- **GmailPollWorker**: The existing BullMQ worker that periodically polls the police Gmail inbox for unread reply emails and ingests their content.
- **Magistrate**: A judicial officer at the Court / Magistrate Office (entity_id: `court_magistrate_office`) who approves or rejects arrest warrants.
- **DepartmentRequest**: The existing MongoDB model used to track outbound requests to external departments; reused to track the warrant email thread with the magistrate.
- **RequestThread**: The existing MongoDB model that stores the message history for a DepartmentRequest; reused for warrant communication.
- **DiaryEntry**: The existing append-only audit log document that records investigation lifecycle events.
- **CaseParticipant**: The existing MongoDB document holding suspect/accused profile data, applied legal sections, and contact information.
- **Complaint**: The existing MongoDB document holding FIR number, police station reference, and district information.
- **BNSS_Section_57**: Bharatiya Nagarik Suraksha Sanhita Section 57 — requires a person in police custody to be produced before a magistrate within 24 hours of arrest.
- **Custody_Timer**: A server-side computed deadline equal to `arrested_at + 24 hours`, enforced via a BullMQ delayed job.
- **Warrant_Status**: The ordered set of states an ArrestWarrant can pass through: `draft` → `sent_to_magistrate` → `approved` | `rejected` → `arrested` → `in_custody` → `produced_before_court` | `released`.
- **PDF_Generator**: The existing PDF generation utility used by firService and caseDiaryService, reused to render the warrant PDF for email attachment.

---

## Requirements

### Requirement 1: Custody Tab in Investigation Workspace

**User Story:** As an IO, I want a dedicated Custody tab in the InvestigationWorkspace, so that I can manage all arrest warrants for the current case without leaving the investigation screen.

#### Acceptance Criteria

1. THE Custody_Panel SHALL be rendered as a tab labelled "Custody" within InvestigationWorkspace alongside the existing tabs (`analysis`, `diary`, `checklist`, `requests`, `evidence`, `participants`, `complaint`, `case_understanding`, `timeline`, `placesVisited`).
2. WHEN the Custody tab is active, THE Custody_Panel SHALL display a list of all ArrestWarrant documents for the current case, ordered by creation date descending.
3. WHEN no warrants exist for the case, THE Custody_Panel SHALL display an empty-state message prompting the IO to draft a new warrant.
4. THE Custody_Panel SHALL show each warrant's suspect/accused name, current Warrant_Status, and a contextual action button reflecting the next allowed lifecycle action.
5. THE Custody_Panel SHALL refresh its warrant list whenever the InvestigationWorkspace polling interval fires (every 15 seconds), consistent with the existing `fetchWorkspaceData` pattern.

---

### Requirement 2: Participants List for Warrant Drafting

**User Story:** As an IO, I want to see all suspects and accused from the case when initiating a warrant, so that I can select the correct person and avoid manually re-entering known details.

#### Acceptance Criteria

1. WHEN the IO opens the Custody tab, THE Custody_Panel SHALL fetch and display all CaseParticipant documents for the case whose `roles` array contains `Suspect` or `Accused`.
2. WHEN a CaseParticipant has both `Suspect` and `Accused` roles, THE Custody_Panel SHALL list that participant once and display all applicable roles.
3. WHEN a CaseParticipant already has an ArrestWarrant in a non-terminal status (`draft`, `sent_to_magistrate`, `approved`, `arrested`, `in_custody`), THE Custody_Panel SHALL disable the "Draft Warrant" button for that participant and display the existing warrant's status instead.
4. WHEN a CaseParticipant has no active warrant, THE Custody_Panel SHALL display a "Draft Warrant" button for that participant.

---

### Requirement 3: Arrest Warrant Draft Form

**User Story:** As an IO, I want an editable arrest warrant form pre-filled with case and participant data, so that I only need to provide the justification and can review other fields before submission.

#### Acceptance Criteria

1. WHEN the IO clicks "Draft Warrant" for a participant, THE Custody_Panel SHALL open a warrant draft form pre-populated with:
   - `fir_number` sourced from `Complaint.firNumber`
   - `police_station` sourced from the populated `Complaint.policeStation.name`
   - `district` sourced from the populated `Complaint.policeStation.district`
   - `applied_sections` sourced from `CaseParticipant.suspectProfile.appliedSections` or `CaseParticipant.accusedProfile.appliedSections` (whichever is non-empty, with accused taking precedence)
   - `accused_name` sourced from `CaseParticipant.name`
   - `accused_address` sourced from `CaseParticipant.contact.address`
   - `accused_identifiers` sourced from `CaseParticipant.identifiers`
   - `warrant_draft_content` pre-generated from the BNSS Form No. 2 template using the above fields
2. THE Custody_Panel SHALL require the IO to enter a non-empty `justification` field before the form can be submitted.
3. WHEN the `justification` field is empty and the IO attempts to submit, THE Custody_Panel SHALL display an inline validation error and SHALL NOT submit the form.
4. THE Custody_Panel SHALL allow the IO to edit the `warrant_draft_content` free-text field before submission.
5. WHEN the IO confirms the draft form, THE Warrant_Service SHALL create an ArrestWarrant document with `status: 'draft'` and return the created document to the frontend.
6. WHEN a Complaint has no `firNumber` registered, THE Custody_Panel SHALL display a warning that a FIR number is required before a warrant can be drafted and SHALL disable the warrant form submission.

---

### Requirement 4: ArrestWarrant Data Model

**User Story:** As a system architect, I want a well-defined ArrestWarrant MongoDB collection, so that all warrant lifecycle data is stored consistently and can be queried efficiently.

#### Acceptance Criteria

1. THE Warrant_Service SHALL persist each ArrestWarrant with the following required fields: `case_id` (ObjectId ref to Complaint), `participant_id` (string ref to CaseParticipant), `warrant_id` (UUID string, unique), `status` (enum: `draft` | `sent_to_magistrate` | `approved` | `rejected` | `arrested` | `in_custody` | `produced_before_court` | `released`), `justification` (non-empty string), `warrant_draft_content` (string), `fir_number` (string), `police_station` (string), `district` (string).
2. THE Warrant_Service SHALL persist the following optional fields on ArrestWarrant: `applied_sections` (array), `sent_at` (Date), `magistrate_response_at` (Date), `magistrate_approval_status` (enum: `pending` | `approved` | `rejected`, default `pending`), `magistrate_rejection_reason` (string), `signed_warrant_pdf_url` (string — Cloudinary URL), `arrested_at` (Date), `custody_deadline` (Date — `arrested_at + 24 hours`), `produced_before_court_at` (Date), `related_department_request_id` (string).
3. THE Warrant_Service SHALL enforce that only one ArrestWarrant per `participant_id` may exist in a non-terminal status (`draft`, `sent_to_magistrate`, `approved`, `arrested`, `in_custody`) at any given time.
4. IF a second ArrestWarrant creation is attempted for a participant that already has an active warrant, THEN THE Warrant_Service SHALL return a 409 Conflict error with a descriptive message.
5. THE Warrant_Service SHALL index the ArrestWarrant collection on `case_id` (ascending) and on `{ case_id: 1, participant_id: 1 }` for efficient lookup.

---

### Requirement 5: Warrant PDF Generation and Email to Magistrate

**User Story:** As an IO, I want to send the finalized warrant draft to the magistrate as a PDF via email, so that the magistrate can review and sign it using the existing email workflow.

#### Acceptance Criteria

1. WHEN the IO clicks "Send to Magistrate" on a warrant with `status: 'draft'`, THE Warrant_Service SHALL generate a PDF rendering of the BNSS Form No. 2 warrant using the existing PDF generation library.
2. THE PDF_Generator SHALL include in the warrant PDF: FIR number, police station, district, accused name, accused address, accused identifiers, applied legal sections, justification, and the pre-filled warrant text.
3. THE Warrant_Service SHALL send an email via GmailService to the magistrate's `contact_email` from DepartmentRegistry where `entity_id = 'court_magistrate_office'`, attaching the warrant PDF.
4. THE email body SHALL contain identifiers in the format `Complaint ID: <case_id>` and `Request ID: <related_department_request_id>` so that GmailPollWorker can route the magistrate's reply back to the correct warrant.
5. THE email body SHALL contain `Reply Origin: department` so that the existing GmailPollWorker parsing logic treats the reply as a department response.
6. THE Warrant_Service SHALL create a DepartmentRequest record with `department_entity_id: 'court_magistrate_office'`, `request_type: 'external_department'`, `recipient_type: 'magistrate'`, and `status: 'sent'`, and SHALL store its `request_id` in `ArrestWarrant.related_department_request_id`.
7. THE Warrant_Service SHALL create a RequestThread record linked to the DepartmentRequest, with an initial IO message containing the warrant draft text.
8. AFTER sending the email, THE Warrant_Service SHALL update the ArrestWarrant `status` to `sent_to_magistrate` and set `sent_at` to the current timestamp.
9. THE Warrant_Service SHALL create a DiaryEntry with `event_type: 'warrant_sent_to_magistrate'` recording the `warrant_id`, `participant_id`, and `sent_at`.
10. IF GmailService fails to send the email, THEN THE Warrant_Service SHALL revert the ArrestWarrant status to `draft` and return a 502 error to the IO.

---

### Requirement 6: Magistrate Reply Ingestion

**User Story:** As a system, I want to automatically parse the magistrate's email reply to determine whether the warrant was approved or rejected, so that the IO can take immediate action without manual data entry.

#### Acceptance Criteria

1. WHEN GmailPollWorker ingests an email whose `Request ID` matches a `related_department_request_id` in an ArrestWarrant, THE Warrant_Service SHALL be invoked to process the magistrate's reply.
2. THE Warrant_Service SHALL inspect the ingested email body for approval signals: presence of words or phrases such as "approved", "sanctioned", "granted", "signed", "order issued" (case-insensitive).
3. THE Warrant_Service SHALL inspect the ingested email body for rejection signals: presence of words or phrases such as "rejected", "refused", "denied", "not granted", "dismissed" (case-insensitive).
4. WHEN the reply contains an approval signal, THE Warrant_Service SHALL set `magistrate_approval_status: 'approved'`, update ArrestWarrant `status` to `approved`, and set `magistrate_response_at` to the current timestamp.
5. WHEN the reply contains a PDF attachment and the warrant is being approved, THE Warrant_Service SHALL store the Cloudinary URL of that PDF in `ArrestWarrant.signed_warrant_pdf_url`.
6. WHEN the reply contains a rejection signal, THE Warrant_Service SHALL set `magistrate_approval_status: 'rejected'`, update ArrestWarrant `status` to `rejected`, set `magistrate_rejection_reason` to the plain-text body of the reply (up to 1000 characters), and set `magistrate_response_at` to the current timestamp.
7. WHEN neither an approval nor a rejection signal is found in the reply, THE Warrant_Service SHALL log a warning, leave the ArrestWarrant `status` as `sent_to_magistrate`, and append the reply as a message in the linked RequestThread for the IO to review manually.
8. THE Warrant_Service SHALL create a DiaryEntry for each state transition triggered by a magistrate reply: `event_type: 'warrant_approved'` or `event_type: 'warrant_rejected'`, including the `warrant_id` and `participant_id` in the payload.
9. WHEN a warrant transitions to `approved` status, THE Custody_Panel SHALL display a "Take into Custody" action button for the IO, and the button SHALL be disabled for warrants in any other status.

---

### Requirement 7: Take into Custody Action

**User Story:** As an IO, I want to mark a person as arrested after the warrant is approved, so that the system starts the 24-hour custody compliance timer and logs the arrest in the case diary.

#### Acceptance Criteria

1. WHEN the IO clicks "Take into Custody" on an ArrestWarrant with `status: 'approved'`, THE Warrant_Service SHALL require the IO to confirm the action (a confirmation modal or button with double-click protection).
2. UPON confirmation, THE Warrant_Service SHALL set ArrestWarrant `status` to `in_custody`, `arrested_at` to the current UTC timestamp, and `custody_deadline` to `arrested_at + 24 hours`.
3. THE Warrant_Service SHALL enqueue a BullMQ delayed job (Custody_Timer) set to fire at `custody_deadline`.
4. WHEN the Custody_Timer fires, THE Warrant_Service SHALL set ArrestWarrant `status` to `in_custody` (unchanged) and SHALL emit a custody deadline alert payload containing `case_id`, `warrant_id`, `participant_id`, and `custody_deadline` via a mechanism readable by the IO and SHO dashboards.
5. THE Warrant_Service SHALL create a DiaryEntry with `event_type: 'suspect_taken_into_custody'` recording `warrant_id`, `participant_id`, `arrested_at`, and `custody_deadline`.

---

### Requirement 8: Custody Deadline Alert

**User Story:** As an IO or SHO, I want to be alerted when the 24-hour BNSS Section 57 custody deadline expires, so that I can produce the accused before the magistrate and avoid a legal violation.

#### Acceptance Criteria

1. WHEN the Custody_Timer BullMQ job fires at `custody_deadline`, THE Warrant_Service SHALL create a DiaryEntry with `event_type: 'custody_deadline_reached'` for the relevant case.
2. WHEN the IO polls the workspace data (every 15 seconds), THE Custody_Panel SHALL check all warrants with `status: 'in_custody'` and display a prominent alert banner for any warrant whose `custody_deadline` is within 2 hours or has passed.
3. THE alert banner SHALL display the accused person's name, the `custody_deadline` timestamp formatted in the local timezone, and a "Mark Produced Before Court" button.
4. WHILE an ArrestWarrant has `status: 'in_custody'` and `custody_deadline` has not passed, THE Custody_Panel SHALL display a live countdown timer showing hours and minutes remaining.

---

### Requirement 9: Produce Before Court and Release

**User Story:** As an IO, I want to record that the accused has been produced before the magistrate or released, so that the custody record reflects the final disposition and the timer alert is cleared.

#### Acceptance Criteria

1. WHEN the IO clicks "Mark Produced Before Court" on an ArrestWarrant with `status: 'in_custody'`, THE Warrant_Service SHALL update `status` to `produced_before_court` and set `produced_before_court_at` to the current UTC timestamp.
2. WHEN THE Warrant_Service transitions an ArrestWarrant to `produced_before_court`, it SHALL create a DiaryEntry with `event_type: 'accused_produced_before_court'` containing `warrant_id`, `participant_id`, and `produced_before_court_at`.
3. WHEN an ArrestWarrant reaches `produced_before_court` status, THE Custody_Panel SHALL clear the countdown timer and alert banner for that warrant.
4. WHEN an ArrestWarrant is in `in_custody` status, THE Custody_Panel SHALL provide a "Mark Released" action that transitions the status to `released` and creates a DiaryEntry with `event_type: 'suspect_released'`.

---

### Requirement 10: Warrant Status Lifecycle Enforcement

**User Story:** As a system, I want all ArrestWarrant status transitions to be validated server-side, so that the warrant lifecycle cannot be corrupted by out-of-order API calls.

#### Acceptance Criteria

1. THE Warrant_Service SHALL enforce the following valid state transitions only:
   - `draft` → `sent_to_magistrate` (IO sends to magistrate)
   - `sent_to_magistrate` → `approved` (magistrate approves via email)
   - `sent_to_magistrate` → `rejected` (magistrate rejects via email)
   - `approved` → `in_custody` (IO takes into custody)
   - `in_custody` → `produced_before_court` (IO produces before court)
   - `in_custody` → `released` (IO marks released)
2. IF an API request attempts any status transition not listed in acceptance criterion 1, THEN THE Warrant_Service SHALL return a 422 Unprocessable Entity error with the current status and the attempted transition in the error body.
3. THE Warrant_Service SHALL validate that the requesting officer has the role of `IO` or `SHO` for all warrant mutation endpoints.
4. IF an unauthorized role attempts to create, update, or transition an ArrestWarrant, THEN THE Warrant_Service SHALL return a 403 Forbidden error.

---

### Requirement 11: Warrant API Endpoints

**User Story:** As a frontend developer, I want a consistent REST API for warrant management, so that the Custody_Panel can perform all required CRUD and lifecycle operations.

#### Acceptance Criteria

1. THE Warrant_Service SHALL expose the following endpoints under the existing `/api/v1/cases/:id/` route prefix:
   - `GET /warrants` — list all warrants for a case
   - `POST /warrants` — create a new warrant draft
   - `GET /warrants/:warrantId` — retrieve a single warrant
   - `PATCH /warrants/:warrantId` — update draft fields (`justification`, `warrant_draft_content`) when `status` is `draft`
   - `POST /warrants/:warrantId/send` — send to magistrate (transitions `draft` → `sent_to_magistrate`)
   - `POST /warrants/:warrantId/custody` — take into custody (transitions `approved` → `in_custody`)
   - `POST /warrants/:warrantId/produced` — mark produced before court (transitions `in_custody` → `produced_before_court`)
   - `POST /warrants/:warrantId/release` — mark released (transitions `in_custody` → `released`)
2. THE `GET /warrants` endpoint SHALL support a query parameter `?participantId=<id>` to filter warrants for a single participant.
3. ALL warrant endpoints SHALL require authentication and SHALL authorize only officers with the `IO` or `SHO` role.
4. THE `POST /warrants` endpoint SHALL accept: `participant_id` (required), `justification` (required), `warrant_draft_content` (optional — if omitted, THE Warrant_Service SHALL generate from template).
5. THE `PATCH /warrants/:warrantId` endpoint SHALL only modify `justification` and `warrant_draft_content`; all other fields SHALL be ignored when the warrant status is `draft`.

---

### Requirement 12: DiaryEntry Integration for Warrant Lifecycle

**User Story:** As an IO or SHO, I want all warrant lifecycle events automatically recorded in the case diary, so that there is a complete, tamper-proof audit trail of custody actions.

#### Acceptance Criteria

1. THE Warrant_Service SHALL extend the `DiaryEventType` enum to include the following new event types: `warrant_drafted`, `warrant_sent_to_magistrate`, `warrant_approved`, `warrant_rejected`, `suspect_taken_into_custody`, `custody_deadline_reached`, `accused_produced_before_court`, `suspect_released`.
2. THE Warrant_Service SHALL create a DiaryEntry immediately upon each of the following transitions: warrant created (`warrant_drafted`), sent to magistrate (`warrant_sent_to_magistrate`), approved (`warrant_approved`), rejected (`warrant_rejected`), arrested (`suspect_taken_into_custody`), deadline reached (`custody_deadline_reached`), produced before court (`accused_produced_before_court`), released (`suspect_released`).
3. EACH DiaryEntry payload for warrant events SHALL include at minimum: `warrant_id`, `participant_id`, and the participant's name at the time of the event.
4. THE `ref_ids` field on warrant DiaryEntry documents SHALL include `participant_id` so that the existing Case Diary feed can link diary entries to participant records.

---

### Requirement 13: Round-Trip Warrant Content Integrity

**User Story:** As a system, I want the warrant draft content stored in the database to be the exact text sent in the PDF, so that the emailed warrant and the stored record are always identical.

#### Acceptance Criteria

1. THE Warrant_Service SHALL use `ArrestWarrant.warrant_draft_content` as the single source of truth for generating the warrant PDF.
2. WHEN the IO edits `warrant_draft_content` in the draft form and saves, THE Warrant_Service SHALL persist the edited content before generating the PDF.
3. WHEN the PDF is generated, THE PDF_Generator SHALL embed the `warrant_draft_content` verbatim without reformatting or summarising.
4. FOR ALL valid ArrestWarrant drafts, rendering the PDF from `warrant_draft_content` and extracting the text back SHALL produce content equivalent to the stored `warrant_draft_content` (round-trip property).
