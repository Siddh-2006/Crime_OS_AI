import { Schema, model, Document, Types } from 'mongoose';

export type EvidenceStatus = 'pending' | 'verified' | 'rejected';

export interface IEvidence extends Document {
  case_id: Types.ObjectId;
  evidence_id: string;
  type: string;                  // e.g. "image", "audio", "document", "video"
  storage_ref: string;           // Cloudinary public_id or equivalent
  ai_description?: string;
  ai_tags: string[];
  uploader_id: Types.ObjectId;
  status: EvidenceStatus;
  linked_diary_entry_id?: string;
  linked_request_id?: string;
}

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
    linked_diary_entry_id: { type: String },
    linked_request_id:     { type: String },
  },
  { timestamps: true, versionKey: false },
);

EvidenceSchema.index({ case_id: 1, status: 1 });

export const Evidence = model<IEvidence>('Evidence', EvidenceSchema);
