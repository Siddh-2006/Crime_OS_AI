import { Schema, model, Document, Types } from 'mongoose';

// ─── Diary Entry ──────────────────────────────────────────────────────────────

export type DiaryActorType = 'officer' | 'system' | 'department';

export type DiaryEventType =
  | 'complaint_filed'
  | 'evidence_added'
  | 'checklist_step_completed'
  | 'request_drafted'
  | 'request_sent'
  | 'response_received'
  | 'analysis_run'
  | 'suggestion_generated'
  | 'officer_note'
  | 'manual_step_added'
  | 'override_correction'
  | 'escalation_raised'
  | 'participant_recommendation_approved'
  | 'participant_added_manually'
  | 'participant_updated'
  | 'participant_deleted'
  | 'participant_sections_attached'
  | 'participant_promoted_to_accused'
  | 'evidence_sections_attached'
  | 'diary_draft_generated'
  | 'diary_finalized'
  | 'case_diary_draft_created'
  | 'case_diary_completed'
  | 'place_visited_added'
  | 'witness_added';

export interface IDiaryEntry extends Document {
  case_id: Types.ObjectId;
  entry_id: string;
  timestamp: Date;
  actor: { type: DiaryActorType; id: string };
  event_type: DiaryEventType;
  payload: Record<string, unknown>;
  ref_ids: {
    evidence_id?: string;
    request_id?: string;
    step_id?: string;
    participant_id?: string;
    snapshot_id?: string;
  };
}

const DiaryEntrySchema = new Schema<IDiaryEntry>(
  {
    case_id:    { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    entry_id:   { type: String, required: true, unique: true },
    timestamp:  { type: Date, default: Date.now, required: true },
    actor: {
      type: { type: String, enum: ['officer', 'system', 'department'], required: true },
      id:   { type: String, required: true },
    },
    event_type: {
      type: String,
      enum: [
        'complaint_filed', 'evidence_added', 'checklist_step_completed',
        'request_drafted', 'request_sent', 'response_received',
        'analysis_run', 'suggestion_generated', 'officer_note',
        'manual_step_added', 'override_correction', 'escalation_raised',
        'participant_recommendation_approved', 'participant_added_manually',
        'participant_updated', 'participant_deleted', 'participant_sections_attached',
        'participant_promoted_to_accused', 'evidence_sections_attached',
        'diary_draft_generated', 'diary_finalized', 'case_diary_draft_created',
        'case_diary_completed', 'place_visited_added', 'witness_added',
      ],
      required: true,
    },
    payload: { type: Schema.Types.Mixed, default: {} },
    ref_ids: {
      evidence_id: { type: String },
      request_id:  { type: String },
      step_id:     { type: String },
      participant_id: { type: String },
      snapshot_id: { type: String },
    },
  },
  {
    // No timestamps: true — timestamp is explicit and controlled.
    // versionKey off because this is append-only (no optimistic locking needed).
    versionKey: false,
  },
);

// Append-only enforcement: disable update/delete at the model level via pre-hooks.
DiaryEntrySchema.pre(['updateOne', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany'], function () {
  throw new Error('DiaryEntry is append-only. Updates and deletes are not permitted.');
});

DiaryEntrySchema.index({ case_id: 1, timestamp: 1 });
DiaryEntrySchema.index({ case_id: 1, event_type: 1 });

export const DiaryEntry = model<IDiaryEntry>('DiaryEntry', DiaryEntrySchema);
