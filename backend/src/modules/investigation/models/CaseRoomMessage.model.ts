import { Schema, model, Document, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export interface ICaseRoomMessage extends Document {
  case_id: Types.ObjectId;
  message_id: string;
  sender_id: Types.ObjectId;
  sender_name: string;
  content: string;
  isEncrypted: boolean;
  sent_at: Date;
}

const CaseRoomMessageSchema = new Schema<ICaseRoomMessage>(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    message_id: { type: String, required: true, unique: true, default: uuidv4 },
    sender_id: { type: Schema.Types.ObjectId, ref: 'Officer', required: true },
    sender_name: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    isEncrypted: { type: Boolean, default: true },
    sent_at: { type: Date, default: Date.now, required: true },
  },
  { timestamps: true, versionKey: false },
);

CaseRoomMessageSchema.index({ case_id: 1, sent_at: 1 });

export const CaseRoomMessage = model<ICaseRoomMessage>('CaseRoomMessage', CaseRoomMessageSchema);
