import { Schema, model, Document } from 'mongoose';

export interface IDepartmentRegistry extends Document {
  entity_id: string;
  entity_name: string;
  category: string;
  what_they_can_provide: string[];
  legal_basis_typically_cited: string[];
  request_format_expected: string;
  typical_response_time: string;
  escalation_path_if_no_response: string;
  notes_or_caveats: string;
  confidence: string;
  contact_email?: string;
  // contact_email_pattern removed — superseded by contact_email
  qdrant_uuid?: string;   // Qdrant point UUID — set after first embedding, used for update/delete
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentRegistrySchema = new Schema<IDepartmentRegistry>(
  {
    entity_id: { type: String, required: true, unique: true, trim: true },
    entity_name: { type: String, required: true },
    category: { type: String, required: true },
    what_they_can_provide: [{ type: String }],
    legal_basis_typically_cited: [{ type: String }],
    request_format_expected: { type: String },
    typical_response_time: { type: String },
    escalation_path_if_no_response: { type: String },
    notes_or_caveats: { type: String },
    confidence: { type: String, default: 'high' },
    contact_email: { type: String },
    // contact_email_pattern removed — superseded by contact_email
    qdrant_uuid: { type: String },  // Qdrant point UUID for targeted update/delete
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const DepartmentRegistry = model<IDepartmentRegistry>('DepartmentRegistry', DepartmentRegistrySchema);
