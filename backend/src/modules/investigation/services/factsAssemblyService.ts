/**
 * factsAssemblyService.ts
 *
 * Pure data-assembly layer — NO LLM calls.
 * Aggregates Mongo state for a case into a single `facts_object` that is
 * later passed verbatim to the analysis LLM (and stored in AnalysisSnapshot.facts_used).
 *
 * facts_object shape:
 * {
 *   meta:               { case_id, assembled_at }
 *   checklist:          { summary: {total,completed,in_progress,blocked,pending,
 *                           completion_pct, high_criticality_pending}
 *                         steps: ChecklistStep[] }
 *   entities:           { by_type: Record<type, string[]>, raw: EntityRow[] }
 *   evidence:           { summary: {total,verified,pending,rejected}
 *                         items: EvidenceRow[] }
 *   department_requests:{ summary: {draft,reviewed,sent,acknowledged,
 *                           response_received,overdue}
 *                         items: RequestRow[] }
 *   recent_diary:       DiaryRow[]          // last 20 entries, oldest first
 * }
 */

import mongoose from 'mongoose';
import { DiaryEntry }         from '../models/DiaryEntry.model';
import { CaseChecklist }      from '../models/CaseChecklist.model';
import { CaseEntity }         from '../models/CaseEntity.model';
import { Evidence }           from '../models/Evidence.model';
import { DepartmentRequest }  from '../models/DepartmentRequest.model';

// ─── Output shape types (inferred from schema) ────────────────────────────────

export interface ChecklistStep {
  step_id:               string;
  sop_id:                string;
  title:                 string;
  status:                string;
  criticality:           string;
  required_evidence:     string[];
  proof_evidence_ids:    string[];
  locked_by_request_id?: string;
}

export interface ChecklistSummary {
  total:                    number;
  completed:                number;
  in_progress:              number;
  blocked:                  number;
  pending:                  number;
  completion_pct:           number;   // completed / total * 100
  high_criticality_pending: number;   // pending/blocked high-criticality steps
}

export interface EntityRow {
  entity_type:                 string;
  value:                       string;
  first_seen_entry_id:         string;
  corroborating_evidence_ids:  string[];
}

export interface EvidenceSummary {
  total:    number;
  verified: number;
  pending:  number;
  rejected: number;
}

export interface EvidenceRow {
  evidence_id:            string;
  type:                   string;
  status:                 string;
  ai_description?:        string;
  ai_tags:                string[];
  linked_diary_entry_id?: string;   // which diary entry added this evidence
  linked_request_id?:     string;   // which dept request this evidence came from
}

export interface RequestSummary {
  draft:             number;
  reviewed:          number;
  sent:              number;
  acknowledged:      number;
  response_received: number;
  overdue:           number;
}

export interface RequestRow {
  request_id:           string;
  step_id:              string;
  department_entity_id: string;
  status:               string;
  sent_at?:             Date;
  response_at?:         Date;
}

export interface DiaryRow {
  entry_id:   string;
  timestamp:  Date;
  actor:      { type: string; id: string };
  event_type: string;
  payload:    Record<string, unknown>;
  ref_ids:    Record<string, string | undefined>;
}

export interface FactsObject {
  meta: {
    case_id:      string;
    assembled_at: Date;
  };
  checklist: {
    summary: ChecklistSummary;
    steps:   ChecklistStep[];
  };
  entities: {
    by_type: Record<string, string[]>;
    raw:     EntityRow[];
  };
  evidence: {
    summary: EvidenceSummary;
    items:   EvidenceRow[];
  };
  department_requests: {
    summary: RequestSummary;
    items:   RequestRow[];
  };
  recent_diary: DiaryRow[];
}

// ─── Config ────────────────────────────────────────────────────────────────────

const RECENT_DIARY_LIMIT = 20;

// ─── Main function ─────────────────────────────────────────────────────────────

export async function buildFactsObject(caseId: string): Promise<FactsObject> {
  const oid = new mongoose.Types.ObjectId(caseId);

  // Run all 5 queries in parallel — no sequential dependency.
  const [checklistDocs, entityDocs, evidenceDocs, requestDocs, diaryDocs] = await Promise.all([
    CaseChecklist.find({ case_id: oid }).lean().exec(),
    CaseEntity.find({ case_id: oid }).lean().exec(),
    Evidence.find({ case_id: oid }).lean().exec(),
    DepartmentRequest.find({ case_id: oid }).lean().exec(),
    DiaryEntry.find({ case_id: oid })
      .sort({ timestamp: -1 })
      .limit(RECENT_DIARY_LIMIT)
      .lean()
      .exec(),
  ]);

  // ── Checklist ───────────────────────────────────────────────────────────────
  const stepsByStatus = { completed: 0, in_progress: 0, blocked: 0, pending: 0 };
  let highCriticalityPending = 0;

  const steps: ChecklistStep[] = checklistDocs.map((s) => {
    stepsByStatus[s.status as keyof typeof stepsByStatus]++;
    if ((s.status === 'pending' || s.status === 'blocked') && s.criticality === 'high') {
      highCriticalityPending++;
    }
    return {
      step_id:               s.step_id,
      sop_id:                s.sop_id,
      title:                 s.title,
      status:                s.status,
      criticality:           s.criticality,
      required_evidence:     s.required_evidence ?? [],
      proof_evidence_ids:    s.proof_evidence_ids ?? [],
      locked_by_request_id:  s.locked_by_request_id,
    };
  });

  const total = checklistDocs.length;
  const checklistSummary: ChecklistSummary = {
    total,
    ...stepsByStatus,
    completion_pct:           total ? Math.round((stepsByStatus.completed / total) * 100) : 0,
    high_criticality_pending: highCriticalityPending,
  };

  // ── Entities ────────────────────────────────────────────────────────────────
  const byType: Record<string, string[]> = {};
  const rawEntities: EntityRow[] = entityDocs.map((e) => {
    if (!byType[e.entity_type]) byType[e.entity_type] = [];
    byType[e.entity_type].push(e.value);
    return {
      entity_type:                e.entity_type,
      value:                      e.value,
      first_seen_entry_id:        e.first_seen_entry_id,
      corroborating_evidence_ids: e.corroborating_evidence_ids ?? [],
    };
  });

  // ── Evidence ────────────────────────────────────────────────────────────────
  const evSummary: EvidenceSummary = { total: evidenceDocs.length, verified: 0, pending: 0, rejected: 0 };
  const evItems: EvidenceRow[] = evidenceDocs.map((ev) => {
    evSummary[ev.status as keyof EvidenceSummary]++;
    return {
      evidence_id:            ev.evidence_id,
      type:                   ev.type,
      status:                 ev.status,
      ai_description:         ev.ai_description,
      ai_tags:                ev.ai_tags ?? [],
      linked_diary_entry_id:  ev.linked_diary_entry_id,
      linked_request_id:      ev.linked_request_id,
    };
  });

  // ── Department requests ─────────────────────────────────────────────────────
  const reqSummary: RequestSummary = {
    draft: 0, reviewed: 0, sent: 0, acknowledged: 0, response_received: 0, overdue: 0,
  };
  const reqItems: RequestRow[] = requestDocs.map((r) => {
    reqSummary[r.status as keyof RequestSummary]++;
    return {
      request_id:           r.request_id,
      step_id:              r.step_id,
      department_entity_id: r.department_entity_id,
      status:               r.status,
      sent_at:              r.sent_at,
      response_at:          r.response_at,
    };
  });

  // ── Recent diary (reverse back to chronological) ───────────────────────────
  const recentDiary: DiaryRow[] = diaryDocs.reverse().map((d) => ({
    entry_id:   d.entry_id,
    timestamp:  d.timestamp,
    actor:      { type: d.actor.type, id: d.actor.id },
    event_type: d.event_type,
    payload:    (d.payload as Record<string, unknown>) ?? {},
    ref_ids:    (d.ref_ids as Record<string, string | undefined>) ?? {},
  }));

  return {
    meta: { case_id: caseId, assembled_at: new Date() },
    checklist:           { summary: checklistSummary, steps },
    entities:            { by_type: byType, raw: rawEntities },
    evidence:            { summary: evSummary, items: evItems },
    department_requests: { summary: reqSummary, items: reqItems },
    recent_diary:        recentDiary,
  };
}
