import { Schema, model, Document, Types } from 'mongoose';

export type SnapshotTrigger = 'manual' | 'auto_on_response' | 'officer_override';

export interface IRankedNextStep {
  step_id: string;
  reason: string;
  confidence: number;
  evidence_needed: string[];
}

export interface ISuspectCandidate {
  entity: string;
  confidence: number;
  supporting_evidence_ids: string[];
  contradicting_evidence_ids: string[];
}

export interface IAnalysisSnapshot extends Document {
  case_id: Types.ObjectId;
  snapshot_id: string;
  timestamp: Date;
  trigger: SnapshotTrigger;
  facts_used: Record<string, unknown>;       // exact facts object fed to LLM — for audit
  ranked_next_steps: IRankedNextStep[];
  suspect_candidates: ISuspectCandidate[];
  narrative_summary: string;
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
  },
  { _id: false },
);

const SuspectCandidateSchema = new Schema<ISuspectCandidate>(
  {
    entity:                      { type: String, required: true },
    confidence:                  { type: Number, required: true, min: 0, max: 1 },
    supporting_evidence_ids:     [{ type: String }],
    contradicting_evidence_ids:  [{ type: String }],
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
    narrative_summary:    { type: String, required: true },
    confidence_breakdown: { type: Schema.Types.Mixed, default: {} },
    officer_authored:     { type: Boolean, default: false, required: true },
    parent_snapshot_id:   { type: String },
  },
  { versionKey: false },
);

AnalysisSnapshotSchema.index({ case_id: 1, timestamp: -1 });

export const AnalysisSnapshot = model<IAnalysisSnapshot>('AnalysisSnapshot', AnalysisSnapshotSchema);
