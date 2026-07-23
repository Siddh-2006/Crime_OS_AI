import { Schema, model, Document, Types } from 'mongoose';
import { AppliedLegalSectionSchema, IAppliedLegalSection, ILegalSectionSuggestion, LegalSectionSuggestionSchema } from './LegalSection.schema';

export interface IAccusedAppliedSections {
  accusedId: Types.ObjectId;
  sections: IAppliedLegalSection[];
}

export interface IFilingMetadata {
  status?: 'draft' | 'ready_for_review' | 'filed' | 'returned';
  filingNumber?: string;
  courtName?: string;
  filedAt?: Date;
  filedBy?: Types.ObjectId;
  notes?: string;
}

export interface IChargeSheet extends Document {
  case_id: Types.ObjectId;
  victimIds: Types.ObjectId[];
  witnessIds: Types.ObjectId[];
  accusedIds: Types.ObjectId[];
  suspectIds: Types.ObjectId[];
  applicableLegalSections: ILegalSectionSuggestion[];
  appliedSectionsByAccused: IAccusedAppliedSections[];
  evidenceIds: Types.ObjectId[];
  departmentRequestIds: Types.ObjectId[];
  diaryEntryIds: Types.ObjectId[];
  investigationSummarySnapshotId?: Types.ObjectId;
  briefCaseDescription?: string;
  investigationSummary?: string;
  investigationFindings?: string;
  finalReport?: string;
  filingMetadata?: IFilingMetadata;
  version: number;
}

const AccusedAppliedSectionsSchema = new Schema<IAccusedAppliedSections>(
  {
    accusedId: { type: Schema.Types.ObjectId, ref: 'CaseParticipant', required: true },
    sections: { type: [AppliedLegalSectionSchema], default: [] },
  },
  { _id: false },
);

const FilingMetadataSchema = new Schema<IFilingMetadata>(
  {
    status: { type: String, enum: ['draft', 'ready_for_review', 'filed', 'returned'], default: 'draft' },
    filingNumber: { type: String, trim: true },
    courtName: { type: String, trim: true },
    filedAt: { type: Date },
    filedBy: { type: Schema.Types.ObjectId, ref: 'Officer' },
    notes: { type: String, trim: true },
  },
  { _id: false },
);

const ChargeSheetSchema = new Schema<IChargeSheet>(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    victimIds: { type: [{ type: Schema.Types.ObjectId, ref: 'CaseParticipant' }], default: [] },
    witnessIds: { type: [{ type: Schema.Types.ObjectId, ref: 'CaseParticipant' }], default: [] },
    accusedIds: { type: [{ type: Schema.Types.ObjectId, ref: 'CaseParticipant' }], default: [] },
    suspectIds: { type: [{ type: Schema.Types.ObjectId, ref: 'CaseParticipant' }], default: [] },
    applicableLegalSections: { type: [LegalSectionSuggestionSchema], default: [] },
    appliedSectionsByAccused: { type: [AccusedAppliedSectionsSchema], default: [] },
    evidenceIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }], default: [] },
    departmentRequestIds: { type: [{ type: Schema.Types.ObjectId, ref: 'DepartmentRequest' }], default: [] },
    diaryEntryIds: { type: [{ type: Schema.Types.ObjectId, ref: 'DiaryEntry' }], default: [] },
    investigationSummarySnapshotId: { type: Schema.Types.ObjectId, ref: 'AnalysisSnapshot' },
    briefCaseDescription: { type: String, trim: true },
    investigationSummary: { type: String, trim: true },
    investigationFindings: { type: String, trim: true },
    finalReport: { type: String, trim: true },
    filingMetadata: { type: FilingMetadataSchema },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, versionKey: false },
);

export const ChargeSheet = model<IChargeSheet>('ChargeSheet', ChargeSheetSchema);
