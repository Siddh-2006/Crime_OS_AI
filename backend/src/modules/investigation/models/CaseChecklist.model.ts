import { Schema, model, Document, Types } from 'mongoose';

export type ChecklistStatus = 'pending' | 'blocked' | 'in_progress' | 'completed';
export type ChecklistCriticality = 'high' | 'medium' | 'low';

export interface ICaseChecklist extends Document {
  case_id: Types.ObjectId;
  sop_id: string;
  step_id: string;
  title: string;
  status: ChecklistStatus;
  criticality: ChecklistCriticality;   // used for confidence weighting (Section 6)
  required_evidence: string[];          // description of what evidence is needed
  proof_evidence_ids: string[];         // evidence_ids that satisfy this step
  locked_by_request_id?: string;        // step is blocked until this request resolves
  department_entity_id?: string;        // External department ID needed for this step
  target?: string;
  completed_by?: Types.ObjectId;
  completed_by_name?: string;
  completed_at?: Date;
}

const CaseChecklistSchema = new Schema<ICaseChecklist>(
  {
    case_id:              { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    sop_id:               { type: String, required: true },
    step_id:              { type: String, required: true },
    title:                { type: String, required: true, trim: true },
    status:               { type: String, enum: ['pending', 'blocked', 'in_progress', 'completed'], default: 'pending', required: true },
    criticality:          { type: String, enum: ['high', 'medium', 'low'], required: true },
    required_evidence:    [{ type: String }],
    proof_evidence_ids:   [{ type: String }],
    locked_by_request_id: { type: String },
    department_entity_id: { type: String },
    target:               { type: String },
    completed_by:         { type: Schema.Types.ObjectId, ref: 'Officer' },
    completed_by_name:    { type: String },
    completed_at:         { type: Date },
  },
  { timestamps: true, versionKey: false },
);

CaseChecklistSchema.index({ case_id: 1, status: 1 });
CaseChecklistSchema.index({ case_id: 1, sop_id: 1 });

export const CaseChecklist = model<ICaseChecklist>('CaseChecklist', CaseChecklistSchema);
