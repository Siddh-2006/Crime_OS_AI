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
 *   recent_diary:       DiaryRow[] | string // last 20 entries, or compressed string
 * }
 */

import mongoose from 'mongoose';
import { compressPrompt } from '../../../shared/clients/promptCompressionClient';
import * as crypto from 'crypto';
import { AnalysisSnapshot } from '../models/AnalysisSnapshot.model';

import { Complaint }          from '../../complaint/models/Complaint.model';
import { DiaryEntry }         from '../models/DiaryEntry.model';
import { CaseChecklist }      from '../models/CaseChecklist.model';
import { CaseEntity }         from '../models/CaseEntity.model';
import { CaseParticipant, ParticipantRole } from '../models/CaseParticipant.model';
import { Evidence }           from '../models/Evidence.model';
import { DepartmentRequest }  from '../models/DepartmentRequest.model';
import { ILegalSectionSuggestion } from '../models/LegalSection.schema';

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
  applicable_sections?:   ILegalSectionSuggestion[];
  linked_diary_entry_id?: string;   // which diary entry added this evidence
  linked_request_id?:     string;   // which dept request this evidence came from
  related_participant_ids?: string[];
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
  department_entity_id?: string;
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

export interface ComplaintFacts {
  complaint_id: string;
  complaint_number?: string;
  status?: string;
  incident_date?: Date;
  incident_time?: string;
  incident_place?: string;
  address?: string;
  coordinates?: string;
  category?: string;
  crime_category?: string;
  short_description?: string;
  detailed_description?: string;
  assigned_io_id?: string;
  assigned_sho_id?: string;
  legal_sections_history?: Array<{
    version: number;
    editedBy: string;
    editorId: string | null;
    content: string;
    timestamp: Date;
  }>;
}

export interface ParticipantProfileFacts {
  injuryDetails?: string;
  lossDetails?: string;
  evidenceIds?: string[];
  appliedSections?: ILegalSectionSuggestion[];
  isAccused?: boolean;
  relationshipToIncident?: string;
}

export interface IParticipantStatementFacts {
  id: string;
  content: string;
  recordedAt: Date;
}

export interface IParticipantReasoningFacts {
  id: string;
  content: string;
  source: 'ai' | 'officer';
  createdAt: Date;
}

export interface ParticipantFactsRow {
  participant_id: string;
  database_id: string;
  name: string;
  roles: ParticipantRole[];
  contact?: { phone?: string; email?: string; address?: string };
  identifiers: Array<{ type: string; value: string; fileUrl?: string }>;
  statements: IParticipantStatementFacts[];
  reasoning: IParticipantReasoningFacts[];
  victim_profile?: ParticipantProfileFacts;
  witness_profile?: ParticipantProfileFacts;
  suspect_profile?: ParticipantProfileFacts;
  complainant_profile?: ParticipantProfileFacts;
  evidence_ids: string[];
  evidence: EvidenceRow[];
}

export interface ParticipantFactsGroup {
  total: number;
  by_role: Record<ParticipantRole, ParticipantFactsRow[]>;
  raw: ParticipantFactsRow[];
  summary: Record<ParticipantRole, number>;
}

export interface FactsObject {
  meta: {
    case_id:      string;
    assembled_at: Date;
  };
  complaint: ComplaintFacts | null;
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
  participants: ParticipantFactsGroup;
  department_requests: {
    summary: RequestSummary;
    items:   RequestRow[];
  };
  recent_diary: DiaryRow[] | string;
}

// ─── Config ────────────────────────────────────────────────────────────────────

const RECENT_DIARY_LIMIT = 20;

// ─── Main function ─────────────────────────────────────────────────────────────

export async function buildFactsObject(caseId: string): Promise<FactsObject> {
  const oid = new mongoose.Types.ObjectId(caseId);

  // Run all 5 queries in parallel — no sequential dependency.
  const [complaintDoc, checklistDocs, entityDocs, participantDocs, evidenceDocs, requestDocs, diaryDocs] = await Promise.all([
    Complaint.findById(oid).lean().exec(),
    CaseChecklist.find({ case_id: oid }).lean().exec(),
    CaseEntity.find({ case_id: oid }).lean().exec(),
    CaseParticipant.find({ case_id: oid }).lean().exec(),
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
      applicable_sections:    Array.isArray(ev.applicableSections) ? ev.applicableSections.map((section: any) => ({
        code: section.code,
        title: section.title,
        ...(section.reason ? { reason: section.reason } : {}),
      })) : [],
      linked_diary_entry_id:  ev.linked_diary_entry_id,
      linked_request_id:      ev.linked_request_id,
      related_participant_ids: (ev.relatedParticipantIds ?? []).map((participantId) => participantId.toString()),
    };
  });

  // ── Participants ───────────────────────────────────────────────────────────
  const participantEvidenceMap = new Map<string, EvidenceRow[]>();
  for (const evidence of evidenceDocs) {
    const linkedIds = (evidence.relatedParticipantIds ?? []).map((participantId) => participantId.toString());
    for (const participantId of linkedIds) {
      const current = participantEvidenceMap.get(participantId) ?? [];
      current.push({
        evidence_id: evidence.evidence_id,
        type: evidence.type,
        status: evidence.status,
        ai_description: evidence.ai_description,
        ai_tags: evidence.ai_tags ?? [],
        applicable_sections: Array.isArray(evidence.applicableSections) ? evidence.applicableSections.map((section: any) => ({
          code: section.code,
          title: section.title,
          ...(section.reason ? { reason: section.reason } : {}),
        })) : [],
        linked_diary_entry_id: evidence.linked_diary_entry_id,
        linked_request_id: evidence.linked_request_id,
        related_participant_ids: linkedIds,
      });
      participantEvidenceMap.set(participantId, current);
    }
  }

  const participantSummary: Record<ParticipantRole, number> = {
    Victim: 0,
    Witness: 0,
    Suspect: 0,
    Accused: 0,
    Complainant: 0,
  };

  const participantRows: ParticipantFactsRow[] = participantDocs.map((participant) => {
    const roles = Array.from(new Set((participant.roles ?? []).filter((role): role is ParticipantRole => [
      'Victim', 'Witness', 'Suspect', 'Accused', 'Complainant',
    ].includes(role as ParticipantRole))));

    for (const role of roles) {
      participantSummary[role]++;
    }

    const linkedEvidence = participantEvidenceMap.get(participant._id.toString()) ?? [];
    const baseProfile = (profile?: Record<string, unknown>) => profile ? { ...profile } : undefined;

    return {
      participant_id: participant.participant_id,
      database_id: participant._id.toString(),
      name: participant.name,
      roles,
      contact: participant.contact ? { ...participant.contact } : undefined,
      identifiers: (participant.identifiers ?? []).map((identifier) => ({ type: identifier.type, value: identifier.value, fileUrl: identifier.fileUrl })),
      statements: (participant.statements ?? []).map((s: any) => ({
        id: s.id,
        content: s.content,
        recordedAt: s.recordedAt,
      })),
      reasoning: (participant.reasoning ?? []).map((r: any) => ({
        id: r.id,
        content: r.content,
        source: r.source,
        createdAt: r.createdAt,
      })),
      victim_profile: baseProfile(participant.victimProfile) as ParticipantProfileFacts | undefined,
      witness_profile: participant.witnessProfile ? {
        evidenceIds: (participant.witnessProfile.evidenceIds ?? []).map((evidenceId) => evidenceId.toString()),
      } : undefined,
      suspect_profile: participant.suspectProfile ? {
        appliedSections: participant.suspectProfile.appliedSections ?? [],
        isAccused: participant.suspectProfile.isAccused ?? false,
      } : undefined,
      complainant_profile: participant.complainantProfile ? {
        relationshipToIncident: participant.complainantProfile.relationshipToIncident,
      } : undefined,
      evidence_ids: linkedEvidence.map((evidence) => evidence.evidence_id),
      evidence: linkedEvidence,
    };
  });

  const participantsByRole: Record<ParticipantRole, ParticipantFactsRow[]> = {
    Victim: [],
    Witness: [],
    Suspect: [],
    Accused: [],
    Complainant: [],
  };

  for (const participant of participantRows) {
    for (const role of participant.roles) {
      participantsByRole[role].push(participant);
    }
  }

  const complaintFacts: ComplaintFacts | null = complaintDoc ? {
    complaint_id: complaintDoc._id.toString(),
    complaint_number: complaintDoc.complaintNumber,
    status: complaintDoc.status,
    incident_date: complaintDoc.incidentDate,
    incident_time: complaintDoc.incidentTime,
    incident_place: complaintDoc.incidentPlace,
    address: complaintDoc.address,
    coordinates: complaintDoc.coordinates,
    category: complaintDoc.category,
    crime_category: complaintDoc.crimeCategory,
    short_description: complaintDoc.shortDescription,
    detailed_description: complaintDoc.detailedDescription,
    assigned_io_id: complaintDoc.assignedIO?.toString(),
    assigned_sho_id: complaintDoc.assignedSHO?.toString(),
    legal_sections_history: (complaintDoc.legalSectionsHistory ?? []).map((entry) => ({
      version: entry.version,
      editedBy: entry.editedBy,
      editorId: entry.editorId ? entry.editorId.toString() : null,
      content: entry.content,
      timestamp: entry.timestamp,
    })),
  } : null;

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
  let recentDiary: any = diaryDocs.reverse().map((d) => ({
    entry_id:   d.entry_id,
    timestamp:  d.timestamp,
    actor:      { type: d.actor.type, id: d.actor.id },
    event_type: d.event_type,
    payload:    (d.payload as Record<string, unknown>) ?? {},
    ref_ids:    (d.ref_ids as Record<string, string | undefined>) ?? {},
  }));


  // ── Prompt Compression ───────────────────────────────────────────────────────
  // Find latest snapshot to check cache
  const latestSnapshot = await AnalysisSnapshot.findOne({ case_id: oid }).sort({ timestamp: -1 }).lean().exec();
  const cache = (latestSnapshot as any)?.compression_cache || {};

  // Helper to extract force tokens
  const extractForceTokens = (text: string): string[] => {
    const tokens = new Set<string>();
    // Evidence IDs
    evItems.forEach(ev => tokens.add(ev.evidence_id));
    // Dept entity IDs
    reqItems.forEach(req => { if (req.department_entity_id) tokens.add(req.department_entity_id); });
    
    // Dates (YYYY-MM-DD)
    const dates = text.match(/\b\d{4}-\d{2}-\d{2}\b/g);
    if (dates) dates.forEach(d => tokens.add(d));
    
    // Phone numbers (simple heuristic: +91-XXX or 10 digits)
    const phones = text.match(/(?:\+\d{1,3}-?)?\d{10}\b/g);
    if (phones) phones.forEach(p => tokens.add(p));
    
    return Array.from(tokens);
  };

  // Compress evidence descriptions
  for (const ev of evItems) {
    if (ev.ai_description && ev.ai_description.length > 2000) {
      const hash = crypto.createHash('sha256').update(ev.ai_description).digest('hex');
      if (cache[hash]) {
        ev.ai_description = cache[hash];
      } else {
        const tokens = extractForceTokens(ev.ai_description);
        const compressed = await compressPrompt(ev.ai_description, tokens, 0.5);
        // We temporarily store it here; the caller (InvestigationService) should ideally save it to the new snapshot
        ev.ai_description = compressed;
      }
    }
  }

  // Compress recent diary
  let diaryTextToCompress = "";
  let compressDiary = false;
  let diaryHash = "";

  const diaryCombinedStr = JSON.stringify(recentDiary);
  if (diaryCombinedStr.length > 8000) {
    compressDiary = true;
    diaryTextToCompress = diaryCombinedStr;
    diaryHash = crypto.createHash('sha256').update(diaryTextToCompress).digest('hex');
  }

  if (compressDiary) {
    if (cache[diaryHash]) {
      // If we cached the compressed string, we can inject it as a special field or parse it.
      // Since recentDiary is typed as DiaryRow[], if we stringify it, it's not a DiaryRow[] anymore.
      // We will add a 'compressed_diary' string to the facts object and clear recent_diary if compressed.
      (recentDiary as any) = cache[diaryHash]; // We'll handle this dynamically in facts object
    } else {
      const tokens = extractForceTokens(diaryTextToCompress);
      const compressed = await compressPrompt(diaryTextToCompress, tokens, 0.5);
      (recentDiary as any) = compressed;
    }
  }

  return {
    meta: { case_id: caseId, assembled_at: new Date() },
    complaint: complaintFacts,
    checklist:           { summary: checklistSummary, steps },
    entities:            { by_type: byType, raw: rawEntities },
    evidence:            { summary: evSummary, items: evItems },
    participants:        { total: participantRows.length, by_role: participantsByRole, raw: participantRows, summary: participantSummary },
    department_requests: { summary: reqSummary, items: reqItems },
    recent_diary:        recentDiary,
  };
}
