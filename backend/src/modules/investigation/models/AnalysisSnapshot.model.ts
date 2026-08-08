import { Schema, model, Document, Types } from 'mongoose';
import { ILegalSectionSuggestion, LegalSectionSuggestionSchema } from './LegalSection.schema';

export type SnapshotTrigger = 'manual' | 'auto_on_response' | 'officer_override';

export type ParticipantRecommendationRole = 'Victim' | 'Witness' | 'Suspect' | 'Accused' | 'Complainant';

export interface IParticipantRecommendationLegalSection extends ILegalSectionSuggestion {
  reason: string;
}

export interface IParticipantRecommendation {
  name: string;
  roles: ParticipantRecommendationRole[];
  confidence: number;
  reason: string;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  recommended_sections?: IParticipantRecommendationLegalSection[];
  suggested_reasoning?: string;
}

export interface IRankedNextStep {
  step_id: string;
  reason: string;
  confidence: number;
  evidence_needed: string[];
  target?: string;
  department_entity_id?: string;
}

export interface IEvidenceSectionRecommendation {
  evidence_id: string;
  evidence_title?: string;
  applicable_sections: ILegalSectionSuggestion[];
}

export interface ISuspectCandidate {
  entity: string;
  confidence: number;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
  recommended_sections?: ILegalSectionSuggestion[];
}

export interface IAnalysisSnapshot extends Document {
  case_id: Types.ObjectId;
  snapshot_id: string;
  timestamp: Date;
  trigger: SnapshotTrigger;
  facts_used: Record<string, unknown>;       // exact facts object fed to LLM — for audit
  ranked_next_steps: IRankedNextStep[];
  suspect_candidates: ISuspectCandidate[];
  participant_recommendations: IParticipantRecommendation[];
  evidence_section_recommendations: IEvidenceSectionRecommendation[];
  narrative_summary: string;
  suggested_legal_sections: ILegalSectionSuggestion[];
  confidence_breakdown: Record<string, unknown>;
  officer_authored: boolean;
  parent_snapshot_id?: string;               // links to previous snapshot for diff
}

const RankedNextStepSchema = new Schema<IRankedNextStep>(
  {
    step_id:         { type: String, required: true },
    reason:          { type: String, required: true },
    confidence:      { type: Number, required: true, min: 0, max: 1 },
    evidence_needed: [{ type: String }],
    target:          { type: String },
    department_entity_id: { type: String },
  },
  { _id: false },
);

const SuspectCandidateSchema = new Schema<ISuspectCandidate>(
  {
    entity:                      { type: String, required: true },
    confidence:                  { type: Number, required: true, min: 0, max: 1 },
    supporting_evidence_ids:     [{ type: String }],
    contradicting_evidence_ids:  [{ type: String }],
    recommended_sections:        { type: [LegalSectionSuggestionSchema], default: [] },
  },
  { _id: false },
);

const ParticipantRecommendationLegalSectionSchema = new Schema<IParticipantRecommendationLegalSection>(
  {
    code: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ParticipantRecommendationSchema = new Schema<IParticipantRecommendation>(
  {
    name:                        { type: String, required: true },
    roles:                       [{ type: String, enum: ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'], required: true }],
    confidence:                  { type: Number, required: true, min: 0, max: 1 },
    reason:                      { type: String, required: true },
    supporting_evidence_ids:     [{ type: String }],
    contradicting_evidence_ids:  [{ type: String }],
    recommended_sections:        { type: [ParticipantRecommendationLegalSectionSchema], default: [] },
    suggested_reasoning:         { type: String },
  },
  { _id: false },
);

const EvidenceSectionRecommendationSchema = new Schema<IEvidenceSectionRecommendation>(
  {
    evidence_id: { type: String, required: true, trim: true },
    evidence_title: { type: String, trim: true },
    applicable_sections: { type: [LegalSectionSuggestionSchema], default: [] },
  },
  { _id: false },
);

const AnalysisSnapshotSchema = new Schema<IAnalysisSnapshot>(
  {
    case_id:              { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    snapshot_id:          { type: String, required: true, unique: true },
    timestamp:            { type: Date, default: Date.now, required: true },
    trigger:              { type: String, enum: ['manual', 'auto_on_response', 'officer_override'], required: true },
    facts_used:           { type: Schema.Types.Mixed, required: true },
    ranked_next_steps:    [RankedNextStepSchema],
    suspect_candidates:   [SuspectCandidateSchema],
    participant_recommendations: { type: [ParticipantRecommendationSchema], default: [] },
    evidence_section_recommendations: { type: [EvidenceSectionRecommendationSchema], default: [] },
    narrative_summary:    { type: String, required: true },
    suggested_legal_sections: { type: [LegalSectionSuggestionSchema], default: [] },
    confidence_breakdown: { type: Schema.Types.Mixed, default: {} },
    officer_authored:     { type: Boolean, default: false, required: true },
    parent_snapshot_id:   { type: String },
  },
  { versionKey: false },
);

AnalysisSnapshotSchema.index({ case_id: 1, timestamp: -1 });

export const AnalysisSnapshot = model<IAnalysisSnapshot>('AnalysisSnapshot', AnalysisSnapshotSchema);
