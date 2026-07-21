import { Schema, model, Document, Types } from 'mongoose';

export type EvidenceStatus = 'pending' | 'verified' | 'rejected';

export interface ICustodyTransfer {
  timestamp: Date;
  from_entity: string;
  to_entity: string;
  status: 'dispatched' | 'received' | 'in_transit' | 'returned';
  proof_storage_ref?: string;
  notes?: string;
}

export interface IEvidence extends Document {
  case_id: Types.ObjectId;
  evidence_id: string;
  type: string;                  // e.g. "image", "audio", "document", "video", "physical_device"
  storage_ref: string;           // Cloudinary public_id or equivalent
  ai_description?: string;
  ai_tags: string[];
  uploader_id: Types.ObjectId;
  status: EvidenceStatus;
  source?: 'complainant' | 'io_officer' | 'department' | 'cyber_analyst';
  origin?: 'post_complaint_request';
  linked_diary_entry_id?: string;
  linked_request_id?: string;
  relatedParticipantIds?: Types.ObjectId[];
  
  // Physical Evidence Tracking
  is_physical?: boolean;
  current_location?: string;
  custody_chain?: ICustodyTransfer[];
}

const CustodyTransferSchema = new Schema<ICustodyTransfer>({
  timestamp: { type: Date, required: true, default: Date.now },
  from_entity: { type: String, required: true },
  to_entity: { type: String, required: true },
  status: { type: String, enum: ['dispatched', 'received', 'in_transit', 'returned'], required: true },
  proof_storage_ref: { type: String },
  notes: { type: String },
}, { _id: false });

const EvidenceSchema = new Schema<IEvidence>(
  {
    case_id:               { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    evidence_id:           { type: String, required: true, unique: true },
    type:                  { type: String, required: true, trim: true },
    storage_ref:           { type: String, required: true },
    ai_description:        { type: String },
    ai_tags:               [{ type: String }],
    uploader_id:           { type: Schema.Types.ObjectId, ref: 'Officer', required: true },
    status:                { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', required: true },
    origin:                { type: String, enum: ['post_complaint_request'] },
    linked_diary_entry_id: { type: String },
    linked_request_id:     { type: String },
    relatedParticipantIds: [{ type: Schema.Types.ObjectId, ref: 'CaseParticipant' }],
    source:                { type: String, enum: ['complainant', 'io_officer', 'department', 'cyber_analyst'], default: 'complainant' },
    
    // Physical Tracking
    is_physical:           { type: Boolean, default: false },
    current_location:      { type: String, default: 'malkhana' },
    custody_chain:         { type: [CustodyTransferSchema], default: [] }
  },
  { timestamps: true, versionKey: false },
);

EvidenceSchema.index({ case_id: 1, status: 1 });

export const Evidence = model<IEvidence>('Evidence', EvidenceSchema);
