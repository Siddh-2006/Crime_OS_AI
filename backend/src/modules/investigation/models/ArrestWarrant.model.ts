import { Schema, model, Document, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ─── Status machine ───────────────────────────────────────────────────────────

/**
 * Valid state transitions (enforced in WarrantService):
 *
 *   draft
 *     └─ sent_to_magistrate
 *          ├─ approved
 *          │    └─ in_custody
 *          │         ├─ produced_before_court  (terminal)
 *          │         └─ released               (terminal)
 *          └─ rejected                         (terminal)
 */
export type WarrantStatus =
  | 'draft'
  | 'sent_to_magistrate'
  | 'approved'
  | 'rejected'
  | 'in_custody'
  | 'produced_before_court'
  | 'released';

export const WARRANT_ACTIVE_STATUSES: WarrantStatus[] = [
  'draft',
  'sent_to_magistrate',
  'approved',
  'in_custody',
];

export const WARRANT_TERMINAL_STATUSES: WarrantStatus[] = [
  'rejected',
  'produced_before_court',
  'released',
];

/** Allowed next states for each current state — single source of truth. */
export const WARRANT_TRANSITIONS: Record<WarrantStatus, WarrantStatus[]> = {
  draft:                  ['sent_to_magistrate'],
  sent_to_magistrate:     ['approved', 'rejected'],
  approved:               ['in_custody'],
  in_custody:             ['produced_before_court', 'released'],
  rejected:               [],
  produced_before_court:  [],
  released:               [],
};

export type MagistrateApprovalStatus = 'pending' | 'approved' | 'rejected';

// ─── Sub-document interfaces ──────────────────────────────────────────────────

/** Snapshot of a legal section applied to the accused at the time of drafting. */
export interface IWarrantAppliedSection {
  code: string;
  title: string;
  reason?: string;
}

/** Snapshot of an accused identifier (e.g. Aadhaar, PAN, phone) at draft time. */
export interface IWarrantIdentifier {
  type: string;
  value: string;
}

// ─── Main document interface ──────────────────────────────────────────────────

export interface IArrestWarrant extends Document {
  // ── Identity ──────────────────────────────────────────────────────────────
  warrant_id: string;                        // UUID — unique across collection
  case_id: Types.ObjectId;                   // ref → Complaint (_id)
  participant_id: string;                    // ref → CaseParticipant.participant_id

  // ── Status machine ────────────────────────────────────────────────────────
  status: WarrantStatus;

  // ── Case/participant snapshot (immutable after creation) ──────────────────
  fir_number: string;                        // Complaint.firNumber
  police_station: string;                    // populated PoliceStation.name
  district: string;                          // populated PoliceStation.district (or address)
  accused_name: string;                      // CaseParticipant.name
  accused_address?: string;                  // CaseParticipant.contact.address
  accused_identifiers: IWarrantIdentifier[]; // CaseParticipant.identifiers
  applied_sections: IWarrantAppliedSection[];// suspectProfile or accusedProfile sections

  // ── IO-authored fields ────────────────────────────────────────────────────
  justification: string;                     // required; why the IO wants to arrest
  warrant_draft_content: string;             // full BNSS Form No. 2 text; editable before send

  // ── Magistrate communication ──────────────────────────────────────────────
  related_department_request_id?: string;    // DepartmentRequest.request_id used to send email
  sent_at?: Date;                            // when email was dispatched
  magistrate_approval_status: MagistrateApprovalStatus;
  magistrate_response_at?: Date;
  magistrate_rejection_reason?: string;      // plain-text body extract (≤1000 chars)
  signed_warrant_pdf_url?: string;           // Cloudinary URL of magistrate's signed PDF

  // ── Custody timer (BNSS §57 — 24-hour rule) ───────────────────────────────
  arrested_at?: Date;                        // set when IO clicks "Take into Custody"
  custody_deadline?: Date;                   // = arrested_at + 24h; BullMQ job fires here
  produced_before_court_at?: Date;           // set when IO clicks "Mark Produced"

  // ── Mongoose timestamps ───────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-document schemas ─────────────────────────────────────────────────────

const WarrantAppliedSectionSchema = new Schema<IWarrantAppliedSection>(
  {
    code:   { type: String, required: true, trim: true },
    title:  { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
  },
  { _id: false },
);

const WarrantIdentifierSchema = new Schema<IWarrantIdentifier>(
  {
    type:  { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

// ─── Main schema ──────────────────────────────────────────────────────────────

const ArrestWarrantSchema = new Schema<IArrestWarrant>(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    warrant_id: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
    },
    case_id: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true,
    },
    participant_id: {
      type: String,
      required: true,
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'draft',
        'sent_to_magistrate',
        'approved',
        'rejected',
        'in_custody',
        'produced_before_court',
        'released',
      ] satisfies WarrantStatus[],
      default: 'draft',
      required: true,
    },

    // ── Case snapshot (written once at creation) ──────────────────────────────
    fir_number:           { type: String, required: true, trim: true },
    police_station:       { type: String, required: true, trim: true },
    district:             { type: String, required: true, trim: true },
    accused_name:         { type: String, required: true, trim: true },
    accused_address:      { type: String, trim: true },
    accused_identifiers:  { type: [WarrantIdentifierSchema], default: [] },
    applied_sections:     { type: [WarrantAppliedSectionSchema], default: [] },

    // ── IO-authored ───────────────────────────────────────────────────────────
    justification: {
      type: String,
      required: true,
      trim: true,
      minlength: [10, 'Justification must be at least 10 characters'],
    },
    warrant_draft_content: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Magistrate communication ──────────────────────────────────────────────
    related_department_request_id: { type: String },
    sent_at:                       { type: Date },
    magistrate_approval_status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'] satisfies MagistrateApprovalStatus[],
      default: 'pending',
      required: true,
    },
    magistrate_response_at:       { type: Date },
    magistrate_rejection_reason:  { type: String, maxlength: 1000 },
    signed_warrant_pdf_url:       { type: String },

    // ── Custody timer ─────────────────────────────────────────────────────────
    arrested_at:               { type: Date },
    custody_deadline:          { type: Date },
    produced_before_court_at:  { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary lookup: all warrants for a case (list endpoint)
ArrestWarrantSchema.index({ case_id: 1, createdAt: -1 });

// Active-warrant uniqueness check: find existing active warrant for a participant
// (used to enforce one active warrant per participant at a time)
ArrestWarrantSchema.index({ participant_id: 1, status: 1 });

// Compound lookup: warrants for a participant within a case
ArrestWarrantSchema.index({ case_id: 1, participant_id: 1 });

// GmailPollWorker reverse-lookup: find warrant by department request id
ArrestWarrantSchema.index({ related_department_request_id: 1 }, { sparse: true });

// ─── Export ───────────────────────────────────────────────────────────────────

export const ArrestWarrant = model<IArrestWarrant>('ArrestWarrant', ArrestWarrantSchema);
