import { Schema, model, Document, Types } from 'mongoose';

export interface IThreadMessage {
  sender: 'io' | 'department';
  content: string;
  timestamp: Date;
  attachments: string[]; // evidence_ids
}

export interface IRequestThread extends Document {
  case_id: Types.ObjectId;
  request_id: string; // references DepartmentRequest.request_id
  department_entity_id: string;
  step_title: string;
  unread_by_io: boolean;
  messages: IThreadMessage[];
}

const ThreadMessageSchema = new Schema<IThreadMessage>({
  sender: { type: String, enum: ['io', 'department'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  attachments: [{ type: String }]
}, { _id: false });

const RequestThreadSchema = new Schema<IRequestThread>({
  case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
  request_id: { type: String, required: true, unique: true },
  department_entity_id: { type: String, required: true },
  step_title: { type: String, required: true },
  unread_by_io: { type: Boolean, default: false },
  messages: [ThreadMessageSchema]
}, { timestamps: true, versionKey: false });

export const RequestThread = model<IRequestThread>('RequestThread', RequestThreadSchema);
