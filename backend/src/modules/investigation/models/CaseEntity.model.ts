import { Schema, model, Document, Types } from 'mongoose';

export interface ICaseEntity extends Document {
  case_id: Types.ObjectId;
  entity_type: string;          // e.g. "phone", "account", "upi", "imei", "name"
  value: string;
  first_seen_entry_id: string;  // diary entry_id where this entity was first noted
  corroborating_evidence_ids: string[];
}

const CaseEntitySchema = new Schema<ICaseEntity>(
  {
    case_id:                   { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    entity_type:               { type: String, required: true, trim: true },
    value:                     { type: String, required: true, trim: true },
    first_seen_entry_id:       { type: String, required: true },
    corroborating_evidence_ids: [{ type: String }],
  },
  { timestamps: true, versionKey: false },
);

CaseEntitySchema.index({ case_id: 1, entity_type: 1 });
CaseEntitySchema.index({ case_id: 1, value: 1 });

export const CaseEntity = model<ICaseEntity>('CaseEntity', CaseEntitySchema);
