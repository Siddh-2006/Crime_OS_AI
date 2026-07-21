import { Schema, Types } from 'mongoose';

export interface ILegalSectionSuggestion {
  code: string;
  title: string;
  reason?: string;
}

export interface IAppliedLegalSection extends ILegalSectionSuggestion {
  attachedBy: Types.ObjectId;
  attachedAt: Date;
}

export const LegalSectionSuggestionSchema = new Schema<ILegalSectionSuggestion>(
  {
    code: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
  },
  { _id: false },
);

export const AppliedLegalSectionSchema = new Schema<IAppliedLegalSection>(
  {
    code: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    reason: { type: String, trim: true },
    attachedBy: { type: Schema.Types.ObjectId, ref: 'Officer', required: true },
    attachedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);
