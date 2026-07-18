import { Schema, model, Document, Types } from 'mongoose';

export type DeptRequestStatus =
  | 'draft' | 'reviewed' | 'sent' | 'acknowledged' | 'response_received' | 'overdue';

export type DeptRequestSentVia = 'email' | 'portal_mock';

export interface IDepartmentRequest extends Document {
  case_id: Types.ObjectId;
  request_id: string;
  step_id: string;                     // checklist step this request satisfies
  department_entity_id: string;        // references DeptRegistry entity
  draft_content: string;
  attachments: string[];               // evidence_ids attached
  status: DeptRequestStatus;
  sent_via?: DeptRequestSentVia;
  sent_at?: Date;
  response_ref?: string;               // storage_ref or text of the response
  response_at?: Date;
}

const DepartmentRequestSchema = new Schema<IDepartmentRequest>(
  {
    case_id:              { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    request_id:           { type: String, required: true, unique: true },
    step_id:              { type: String, required: true },
    department_entity_id: { type: String, required: true },
    draft_content:        { type: String, required: true },
    attachments:          [{ type: String }],
    status:               {
      type: String,
      enum: ['draft', 'reviewed', 'sent', 'acknowledged', 'response_received', 'overdue'],
      default: 'draft',
      required: true,
    },
    sent_via:    { type: String, enum: ['email', 'portal_mock'] },
    sent_at:     { type: Date },
    response_ref: { type: String },
    response_at:  { type: Date },
  },
  { timestamps: true, versionKey: false },
);

DepartmentRequestSchema.index({ case_id: 1, status: 1 });
DepartmentRequestSchema.index({ case_id: 1, step_id: 1 });

export const DepartmentRequest = model<IDepartmentRequest>('DepartmentRequest', DepartmentRequestSchema);
