import { Schema, model, Document, Types } from 'mongoose';

export type EscalationStatus = 'pending' | 'sent' | 'resolved';

export interface IEscalation extends Document {
  case_id: Types.ObjectId;
  escalation_id: string;
  reason: string;
  triggered_at: Date;
  summary: string;
  sent_to: string;    // recipient — senior officer badge/id or department name
  status: EscalationStatus;
}

const EscalationSchema = new Schema<IEscalation>(
  {
    case_id:       { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    escalation_id: { type: String, required: true, unique: true },
    reason:        { type: String, required: true },
    triggered_at:  { type: Date, default: Date.now, required: true },
    summary:       { type: String, required: true },
    sent_to:       { type: String, required: true },
    status:        { type: String, enum: ['pending', 'sent', 'resolved'], default: 'pending', required: true },
  },
  { timestamps: true, versionKey: false },
);

EscalationSchema.index({ case_id: 1, status: 1 });

export const Escalation = model<IEscalation>('Escalation', EscalationSchema);
