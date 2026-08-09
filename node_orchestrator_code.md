import { v4 as uuidv4 } from 'uuid';
import { buildFactsObject } from './factsAssemblyService';
import { callLegalAgent } from '../../../shared/clients/legalAgentClient';
// import { callIoRecommendation } from '../../../shared/clients/ioRecommendationClient';
import { buildFastPrompt, buildDeepPrompt, buildCorrectionPrompt } from './analysisPromptBuilder';
import { computeConfidenceScore } from './confidenceScoringService';
import { fastCall, deepCall } from '../../../shared/llm/ollamaClient';
import { AnalysisSnapshot, IEvidenceSectionRecommendation, IParticipantRecommendation, ISuspectCandidate, ParticipantRecommendationRole } from '../models/AnalysisSnapshot.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { Escalation } from '../models/Escalation.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { EmailQueue } from '../../../shared/queue/EmailQueue';
import { publishProgress } from '../../../shared/utils/analysisProgress';
import { triggerComplaintIntelligencePipelineByCaseId } from '../../../shared/services/complaintIntelligenceService';
import { ILegalSectionSuggestion } from '../models/LegalSection.schema';

import logger from '../../../config/logger';

function normalizeSuggestedLegalSections(sections: unknown): ILegalSectionSuggestion[] {
  if (!Array.isArray(sections)) return [];

  const normalized: ILegalSectionSuggestion[] = [];
  const seen = new Set<string>();

  sections.forEach((section) => {
    const addSection = (code: string, title: string, reason?: string) => {
      const key = `${code || title}`.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      normalized.push({ code: code.trim(), title: title.trim(), ...(reason?.trim() ? { reason } : {}) });
    };

    if (typeof section === 'string') {
      const raw = section.trim();
      if (!raw) return;
      const match = raw.match(/^([A-Za-z0-9.\-]+)\s*[:\-]\s*(.+)$/);
      addSection(match ? match[1].trim() : raw, match ? match[2].trim() : raw, undefined);
      return;
    }

    if (!section || typeof section !== 'object') return;

    const candidate = section as Record<string, unknown>;
    const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const altCode = typeof candidate.sectionCode === 'string' ? candidate.sectionCode.trim() : '';
    const altTitle = typeof candidate.sectionTitle === 'string' ? candidate.sectionTitle.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : undefined;

    if (code || title || altCode || altTitle || name) {
      addSection(code || altCode || name || title, title || altTitle || name || code || altCode || '', reason);
    }
  });

  return normalized;
}

function normalizeParticipantRoles(roles: unknown): ParticipantRecommendationRole[] {
  if (!Array.isArray(roles)) return [];

  const allowedRoles: ParticipantRecommendationRole[] = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'];
  return Array.from(new Set(
    roles.filter((role): role is ParticipantRecommendationRole => typeof role === 'string' && allowedRoles.includes(role as ParticipantRecommendationRole))
  ));
}

function normalizeEvidenceSectionRecommendations(recommendations: unknown): IEvidenceSectionRecommendation[] {
  if (!Array.isArray(recommendations)) return [];

  return recommendations.flatMap((recommendation): IEvidenceSectionRecommendation[] => {
    if (!recommendation || typeof recommendation !== 'object') return [];

    const candidate = recommendation as Record<string, unknown>;
    const evidenceId = typeof candidate.evidence_id === 'string' ? candidate.evidence_id.trim() : '';
    if (!evidenceId) return [];

    const evidenceTitle = typeof candidate.evidence_title === 'string' ? candidate.evidence_title.trim() : '';
    const applicableSections = normalizeSuggestedLegalSections(candidate.applicable_sections);

    return [{
      evidence_id: evidenceId,
      ...(evidenceTitle ? { evidence_title: evidenceTitle } : {}),
      applicable_sections: applicableSections.map((section) => ({
        code: section.code,
        title: section.title,
        ...(section.reason ? { reason: section.reason } : {}),
      })),
    }];
  });
}

function normalizeParticipantRecommendations(recommendations: unknown): IParticipantRecommendation[] {
  if (!Array.isArray(recommendations)) return [];

  return recommendations.flatMap((recommendation): IParticipantRecommendation[] => {
    if (!recommendation || typeof recommendation !== 'object') return [];

    const candidate = recommendation as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || typeof candidate.reason !== 'string') return [];
    const reasonText = candidate.reason as string;

    const roles = normalizeParticipantRoles(candidate.roles);
    if (roles.length === 0) return [];

    const supportingEvidence = Array.isArray(candidate.supporting_evidence_ids)
      ? candidate.supporting_evidence_ids.filter((value): value is string => typeof value === 'string')
      : [];
    const contradictingEvidence = Array.isArray(candidate.contradicting_evidence_ids)
      ? candidate.contradicting_evidence_ids.filter((value): value is string => typeof value === 'string')
      : [];

    const normalizedSections = normalizeSuggestedLegalSections(candidate.recommended_sections);
    const hasSensitiveRole = roles.includes('Suspect') || roles.includes('Accused');

    return [{
      name: candidate.name,
      roles,
      confidence: typeof candidate.confidence === 'number' ? (candidate.confidence > 1 ? candidate.confidence / 100 : candidate.confidence) : 0,
      reason: reasonText,
      supporting_evidence_ids: supportingEvidence,
      contradicting_evidence_ids: contradictingEvidence,
      recommended_sections: hasSensitiveRole ? normalizedSections.map((section) => ({
        code: section.code,
        title: section.title,
        reason: typeof section.reason === 'string' && section.reason.trim().length > 0 ? section.reason : reasonText,
      })) : [],
    }];
  });
}

function participantRecommendationsToSuspectCandidates(recommendations: IParticipantRecommendation[]): ISuspectCandidate[] {
  return recommendations
    .filter((recommendation) => recommendation.roles.includes('Suspect') || recommendation.roles.includes('Accused'))
    .map((recommendation) => ({
      entity: recommendation.name,
      confidence: recommendation.confidence,
      supporting_evidence_ids: recommendation.supporting_evidence_ids,
      contradicting_evidence_ids: recommendation.contradicting_evidence_ids,
      recommended_sections: recommendation.recommended_sections?.map((section) => ({
        code: section.code,
        title: section.title,
        reason: section.reason,
      })) ?? [],
    }));
}

function suspectCandidatesToParticipantRecommendations(candidates: ISuspectCandidate[]): IParticipantRecommendation[] {
  return candidates.map((candidate) => ({
    name: candidate.entity,
    roles: ['Suspect'],
    confidence: candidate.confidence,
    reason: candidate.recommended_sections?.length
      ? `Legacy suspect candidate aligned to candidate legal sections: ${candidate.recommended_sections.map((section) => section.code).join(', ')}`
      : 'Legacy suspect candidate output from deep analysis.',
    supporting_evidence_ids: candidate.supporting_evidence_ids,
    contradicting_evidence_ids: candidate.contradicting_evidence_ids,
    recommended_sections: candidate.recommended_sections?.map((section) => ({
      code: section.code,
      title: section.title,
      reason: section.reason || 'Legacy suspect candidate recommendation',
    })) ?? [],
  }));
}

function legalSectionsToLegacyText(sections: ILegalSectionSuggestion[]): string {
  return sections
    .map((section) => `${section.code}: ${section.title}${section.reason ? ` - ${section.reason}` : ''}`)
    .join('\n');
}

export class InvestigationOrchestrator {
  /**
   * Executes the full orchestrator loop for a given case.
   */
  static async runAnalysis(caseId: string, trigger: string = 'manual', language: string = 'en'): Promise<any> {
    logger.info(`[Orchestrator] â–¶ Starting analysis for caseId: ${caseId}, trigger: ${trigger}`);

    // Trigger Complaint Intelligence pipeline rerun in background
    triggerComplaintIntelligencePipelineByCaseId(caseId).catch((err) => {
      logger.error('[Orchestrator] Error triggering complaint intelligence pipeline rerun:', err);
    });

    // 1. Facts Assembly
    logger.info(`[Orchestrator] [1/7] Assembling facts from MongoDB for caseId: ${caseId}`);
    const factsObject = await buildFactsObject(caseId);
    logger.info(`[Orchestrator] [1/7] Facts assembled â€” checklist: ${factsObject.checklist.summary.total} steps, evidence: ${factsObject.evidence.summary.total} items, diary: ${factsObject.recent_diary.length} entries`);
    await publishProgress(caseId, 'facts_assembled');

    // 2. Retrieval
    const queryStr = `Blocked Steps: ${factsObject.checklist.summary.blocked}. Pending High Criticality: ${factsObject.checklist.summary.high_criticality_pending}.`;
    logger.info(`[Orchestrator] [2/7] Dispatching concurrent retrieval calls â€” legal agent + IO recommendation`);

    const [legalAgentResult] = await Promise.all([
      callLegalAgent(queryStr),
      // callIoRecommendation(queryStr)
    ]);
    const legalFallback = (legalAgentResult as any)._fallback_used;
    // const ioFallback    = (recommendationResult as any)._fallback_used;
    logger.info(`[Orchestrator] [2/7] Retrieval done â€” legal agent: ${legalFallback ? 'FALLBACK' : `${(legalAgentResult as any).retrieved_chunks?.length ?? 0} chunks`}`);
    // logger.info(`[Orchestrator] [2/7] Retrieval done â€” legal agent: ${legalFallback ? 'FALLBACK' : `${(legalAgentResult as any).retrieved_chunks?.length ?? 0} chunks`}, IO recommendation: ${ioFallback ? 'FALLBACK' : 'OK'}`);
    await publishProgress(caseId, 'legal_retrieved');

    // 3. Confidence scoring (deterministic, no LLM)
    logger.info(`[Orchestrator] [3/7] Computing algorithmic confidence score`);
    const confidenceBreakdown = computeConfidenceScore(factsObject);
    logger.info(`[Orchestrator] [3/7] Confidence: evidence=${(confidenceBreakdown.evidence_coverage * 100).toFixed(0)}% checklist=${(confidenceBreakdown.checklist_progress * 100).toFixed(0)}% final=${(confidenceBreakdown.final_score * 100).toFixed(0)}%`);
    await publishProgress(caseId, 'confidence_scored');

    // 4. Fast LLM pass
    logger.info(`[Orchestrator] [4/7] Running fast model pass (temp=0.3, max_tokens=512)`);
    const fastPrompt = buildFastPrompt(factsObject, legalAgentResult, language);
    const fastResponse = await fastCall(fastPrompt.system, fastPrompt.user) as string;
    logger.info(`[Orchestrator] [4/7] Fast pass complete â€” response length: ${fastResponse?.length ?? 0} chars`);
    await publishProgress(caseId, 'fast_pass_done');

    // 5. Deep LLM pass
    logger.info(`[Orchestrator] [5/7] Running deep model pass (temp=0.1, max_tokens=1024, jsonMode=true)`);

    // Fetch active department entity IDs to ground the LLM â€” prevents hallucinated entity IDs
    const { DepartmentRegistry } = await import('../../admin/models/DepartmentRegistry.model');
    const activeDepts = await DepartmentRegistry.find({ isActive: true }, { entity_id: 1, entity_name: 1 }).lean();
    const deptWhitelist = activeDepts.map((d: any) => `  ${d.entity_id} â†’ ${d.entity_name}`).join('\n');
    logger.debug(`[Orchestrator] Dept whitelist: ${activeDepts.length} active departments`);

    const deepPrompt = buildDeepPrompt(factsObject, legalAgentResult, confidenceBreakdown, deptWhitelist, language);
    // const deepPrompt = buildDeepPrompt(factsObject, legalAgentResult, recommendationResult, confidenceBreakdown, deptWhitelist);
    const deepResponse = await deepCall(deepPrompt.system, deepPrompt.user, { jsonMode: true }) as any;


    if (!deepResponse || !deepResponse.ranked_next_steps) {
      logger.error(`[Orchestrator] [5/7] Deep model returned invalid/empty JSON. Response: ${JSON.stringify(deepResponse)?.slice(0, 200)}`);
      throw new Error(`[Orchestrator] Deep model failed to return valid JSON structure.`);
    }
    logger.info(`[Orchestrator] [5/7] Deep pass complete â€” ${deepResponse.ranked_next_steps?.length ?? 0} steps, ${deepResponse.suspect_candidates?.length ?? 0} suspects`);
    await publishProgress(caseId, 'deep_pass_done');

    // 6. Persist
    logger.info(`[Orchestrator] [6/7] Persisting AnalysisSnapshot to MongoDB`);
    const previousSnapshot = await AnalysisSnapshot.findOne({ case_id: caseId }).sort({ timestamp: -1 });

    const normalizeConfidence = (c: number) => c > 1 ? c / 100 : c;
    const ranked_next_steps = deepResponse.ranked_next_steps.map((step: any) => ({
      ...step,
      confidence: normalizeConfidence(step.confidence)
    }));
    const legacySuspectCandidates = (deepResponse.suspect_candidates || []).map((cand: any) => ({
      ...cand,
      confidence: normalizeConfidence(cand.confidence),
      recommended_sections: normalizeSuggestedLegalSections(cand.recommended_sections),
    }));
    const participant_recommendations = normalizeParticipantRecommendations(deepResponse.participant_recommendations);
    const normalizedParticipantRecommendations = participant_recommendations.length > 0
      ? participant_recommendations
      : suspectCandidatesToParticipantRecommendations(legacySuspectCandidates);
    const normalizedSuspectCandidates = participantRecommendationsToSuspectCandidates(normalizedParticipantRecommendations);
    const evidence_section_recommendations = normalizeEvidenceSectionRecommendations(deepResponse.evidence_section_recommendations);
    const suggested_legal_sections = normalizeSuggestedLegalSections(deepResponse.suggested_legal_sections);

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger,
      facts_used: factsObject,
      ranked_next_steps,
      suspect_candidates: normalizedSuspectCandidates,
      participant_recommendations: normalizedParticipantRecommendations,
      evidence_section_recommendations,
      narrative_summary: deepResponse.narrative_summary || fastResponse,
      suggested_legal_sections,
      confidence_breakdown: confidenceBreakdown,
      officer_authored: false,
      parent_snapshot_id: previousSnapshot?._id || undefined,
    });
    const savedSnapshot = await newSnapshot.save();
    logger.info(`[Orchestrator] [6/7] Snapshot saved â€” id: ${savedSnapshot.snapshot_id}`);
    await publishProgress(caseId, 'persisted');

    // Append Diary Entry
    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'system', id: 'orchestrator' },
      event_type: 'analysis_run',
      payload: {
        snapshot_id: savedSnapshot._id.toString(),
        narrative_summary: savedSnapshot.narrative_summary,
        ranked_next_steps: savedSnapshot.ranked_next_steps
      },
      ref_ids: { snapshot_id: savedSnapshot._id.toString() }
    });

    // Update case_checklist statuses if analysis implies changes (noting logic here)
    // We will sync any new ranked_next_steps generated by AI into the CaseChecklist collection
    for (const step of ranked_next_steps) {
      const existingStep = await CaseChecklist.findOne({ case_id: caseId, step_id: step.step_id });
      if (!existingStep) {
        await CaseChecklist.create({
          case_id: caseId,
          sop_id: 'AI_GEN', // Auto-generated by AI
          step_id: step.step_id,
          title: step.reason || 'AI Suggested Step', // The AI's reason is usually the step title/description
          status: 'pending',
          criticality: step.confidence > 0.8 ? 'high' : (step.confidence > 0.5 ? 'medium' : 'low'),
          required_evidence: step.evidence_needed || [],
          proof_evidence_ids: [],
          target: step.target,
          department_entity_id: step.department_entity_id,
        });
      } else if (existingStep.status !== 'completed' && existingStep.status !== 'blocked') {
        // Dynamically reprioritize and update targets for pending steps based on new AI context
        existingStep.title = step.reason || existingStep.title;
        existingStep.criticality = step.confidence > 0.8 ? 'high' : (step.confidence > 0.5 ? 'medium' : 'low');
        existingStep.target = step.target || existingStep.target;
        existingStep.department_entity_id = step.department_entity_id || existingStep.department_entity_id;

        // Merge evidence needed (avoid duplicates)
        const newEvidence = step.evidence_needed || [];
        existingStep.required_evidence = Array.from(new Set([...existingStep.required_evidence, ...newEvidence]));

        await existingStep.save();
      }
    }

    if (suggested_legal_sections.length > 0) {
      const { Complaint } = await import('../../complaint/models/Complaint.model');
      const complaintDoc = await Complaint.findById(caseId);
      if (complaintDoc) {
        const lastVersion = complaintDoc.legalSectionsHistory?.length
          ? complaintDoc.legalSectionsHistory[complaintDoc.legalSectionsHistory.length - 1].version
          : 0;
        await Complaint.findByIdAndUpdate(caseId, {
          $push: {
            legalSectionsHistory: {
              version: lastVersion + 1,
              editedBy: 'IO', // Needs to match 'Citizen' | 'SHO' | 'IO'
              editorId: null, // AI system
              content: legalSectionsToLegacyText(suggested_legal_sections),
              timestamp: new Date()
            }
          }
        });
      }
    }

    // 7. Escalation check
    logger.info(`[Orchestrator] [7/7] Running escalation check`);
    await this.runEscalationCheck(caseId, savedSnapshot);

    await publishProgress(caseId, 'done');
    logger.info(`[Orchestrator] âœ… Analysis complete for caseId: ${caseId} â€” snapshot: ${savedSnapshot.snapshot_id}`);
    return savedSnapshot;
  }

  /**
   * Evaluates escalation triggers based on recent analysis runs.
   */
  private static async runEscalationCheck(caseId: string, latestSnapshot: any): Promise<void> {
    logger.debug(`[Orchestrator] Running escalation check for caseId: ${caseId}`);

    // Check if an unresolved escalation already exists
    const existing = await Escalation.findOne({ case_id: caseId, status: { $in: ['pending', 'sent'] } });
    if (existing) {
      logger.debug(`[Orchestrator] Case ${caseId} already has an active escalation. Skipping check.`);
      return;
    }

    const last3 = await AnalysisSnapshot.find({ case_id: caseId }).sort({ timestamp: -1 }).limit(3).lean();

    let shouldEscalate = false;
    let reason = '';

    // Condition 1: 3+ consecutive runs with no new completions AND no new evidence
    if (last3.length === 3) {
      const s1Facts = last3[0].facts_used as any;
      const s2Facts = last3[1].facts_used as any;
      const s3Facts = last3[2].facts_used as any;

      const evidenceCount = s1Facts.evidence.summary.total;
      const completedCount = s1Facts.checklist.summary.completed;

      const noChange = (s2Facts.evidence.summary.total === evidenceCount &&
        s2Facts.checklist.summary.completed === completedCount &&
        s3Facts.evidence.summary.total === evidenceCount &&
        s3Facts.checklist.summary.completed === completedCount);

      if (noChange) {
        shouldEscalate = true;
        reason = '3 consecutive analysis runs with no new evidence and no completed checklist steps.';
      }
    }

    // Condition 2: All pending steps blocked
    const latestFacts = latestSnapshot.facts_used as any;
    const { blocked, pending } = latestFacts.checklist.summary;
    if (!shouldEscalate && blocked > 0 && pending === 0) {
      shouldEscalate = true;
      reason = 'All remaining checklist steps are blocked with no immediate pending steps to take.';
    }

    if (shouldEscalate) {
      await this.triggerEscalation(caseId, reason, latestFacts);
    }
  }

  /**
   * Triggers an escalation manually or automatically.
   */
  static async triggerEscalation(caseId: string, reason: string, factsUsed: any): Promise<any> {
    logger.info(`[Orchestrator] Triggering escalation for caseId: ${caseId} - Reason: ${reason}`);

    // Fast LLM call to draft a short summary
    const system = 'You are a police escalation agent. Draft a short 2-3 sentence summary of why this case is stuck based on the provided facts and reason.';
    const user = `Reason for escalation: ${reason}\n\nFacts:\n${JSON.stringify(factsUsed, null, 2)}\n\nDraft a concise professional summary for the Station House Officer (SHO).`;

    let summary = '';
    try {
      summary = await fastCall(system, user) as string;
    } catch (err) {
      summary = `Case escalated due to: ${reason}. (Auto-summary failed).`;
    }

    const escalation = new Escalation({
      case_id: caseId,
      escalation_id: uuidv4(),
      reason,
      summary,
      sent_to: 'SHO_Gandhinagar',
      status: 'sent'
    });

    await escalation.save();

    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'system', id: 'orchestrator' },
      event_type: 'escalation_raised',
      payload: { escalation_id: escalation.escalation_id, reason },
      ref_ids: { escalation_id: escalation.escalation_id }
    });

    // Enqueue Email Notification
    await EmailQueue.enqueueEscalationEmail({
      to: 'sho.gandhinagar@gujarat.police.in',
      caseId,
      escalationId: escalation.escalation_id,
      reason,
      summary
    });

    return escalation;
  }

  /**
   * Accepts an officer's free-text message to correct an existing snapshot.
   * Calls the LLM to generate a new revised snapshot.
   */
  static async correctSnapshot(caseId: string, snapshotId: string, correctionMessage: string): Promise<any> {
    logger.info(`[Orchestrator] Correcting snapshot ${snapshotId} for caseId: ${caseId}`);

    const originalSnapshot = await AnalysisSnapshot.findOne({ snapshot_id: snapshotId }).lean();
    if (!originalSnapshot) {
      throw new Error('Original snapshot not found');
    }

    const prompt = buildCorrectionPrompt(originalSnapshot.facts_used as any, originalSnapshot, correctionMessage);
    const deepResponse = await deepCall(prompt.system, prompt.user, { jsonMode: true }) as any;

    if (!deepResponse || !deepResponse.ranked_next_steps) {
      throw new Error(`[Orchestrator] Deep model failed to return valid JSON structure for correction.`);
    }

    const normalizeConfidence = (c: number) => c > 1 ? c / 100 : c;
    const ranked_next_steps = deepResponse.ranked_next_steps.map((step: any) => ({
      ...step,
      confidence: normalizeConfidence(step.confidence)
    }));
    const legacySuspectCandidates = (deepResponse.suspect_candidates || []).map((cand: any) => ({
      ...cand,
      confidence: normalizeConfidence(cand.confidence),
      recommended_sections: normalizeSuggestedLegalSections(cand.recommended_sections),
    }));
    const participant_recommendations = normalizeParticipantRecommendations(deepResponse.participant_recommendations);
    const normalizedParticipantRecommendations = participant_recommendations.length > 0
      ? participant_recommendations
      : suspectCandidatesToParticipantRecommendations(legacySuspectCandidates);
    const suspect_candidates = participantRecommendationsToSuspectCandidates(normalizedParticipantRecommendations);
    const evidence_section_recommendations = normalizeEvidenceSectionRecommendations(deepResponse.evidence_section_recommendations);
    const suggested_legal_sections = normalizeSuggestedLegalSections(deepResponse.suggested_legal_sections);

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger: 'officer_override',
      facts_used: originalSnapshot.facts_used, // keep the same facts as the parent
      ranked_next_steps,
      suspect_candidates,
      participant_recommendations: normalizedParticipantRecommendations,
      evidence_section_recommendations,
      narrative_summary: deepResponse.narrative_summary,
      suggested_legal_sections,
      confidence_breakdown: originalSnapshot.confidence_breakdown, // Keep same breakdown or recalulate? Keeping same for audit traceability.
      officer_authored: false,
      parent_snapshot_id: snapshotId,
    });

    const savedSnapshot = await newSnapshot.save();

    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'officer' },
      event_type: 'override_correction',
      payload: {
        snapshot_id: savedSnapshot._id.toString(),
        parent_snapshot_id: snapshotId,
        correction_message: correctionMessage
      },
      ref_ids: { snapshot_id: savedSnapshot._id.toString() }
    });

    return savedSnapshot;
  }

  /**
   * Creates a fully officer-authored snapshot with no LLM call.
   */
  static async createManualSnapshot(caseId: string, payload: {
    ranked_next_steps: any[];
    suspect_candidates: any[];
    participant_recommendations?: IParticipantRecommendation[];
    evidence_section_recommendations?: IEvidenceSectionRecommendation[];
    narrative_summary: string;
    suggested_legal_sections?: ILegalSectionSuggestion[];
  }): Promise<any> {
    logger.info(`[Orchestrator] Creating manual officer snapshot for caseId: ${caseId}`);

    const factsObject = await buildFactsObject(caseId);

    // Find previous snapshot to set parent chain
    const previousSnapshot = await AnalysisSnapshot.findOne({ case_id: caseId }).sort({ timestamp: -1 });

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger: 'manual',
      facts_used: factsObject,
      ranked_next_steps: payload.ranked_next_steps,
      suspect_candidates: payload.suspect_candidates,
      participant_recommendations: payload.participant_recommendations || [],
      evidence_section_recommendations: payload.evidence_section_recommendations || [],
      narrative_summary: payload.narrative_summary,
      suggested_legal_sections: normalizeSuggestedLegalSections(payload.suggested_legal_sections),
      confidence_breakdown: computeConfidenceScore(factsObject),
      officer_authored: true,
      parent_snapshot_id: previousSnapshot?._id || undefined,
    });

    const savedSnapshot = await newSnapshot.save();

    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'officer' },
      event_type: 'analysis_run',
      payload: { snapshot_id: savedSnapshot._id.toString(), manual: true },
      ref_ids: { snapshot_id: savedSnapshot._id.toString() }
    });

    return savedSnapshot;
  }
}
/**
 * factsAssemblyService.ts
 *
 * Pure data-assembly layer â€” NO LLM calls.
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
import { Complaint }          from '../../complaint/models/Complaint.model';
import { DiaryEntry }         from '../models/DiaryEntry.model';
import { CaseChecklist }      from '../models/CaseChecklist.model';
import { CaseEntity }         from '../models/CaseEntity.model';
import { CaseParticipant, ParticipantRole } from '../models/CaseParticipant.model';
import { Evidence }           from '../models/Evidence.model';
import { DepartmentRequest }  from '../models/DepartmentRequest.model';
import { ILegalSectionSuggestion } from '../models/LegalSection.schema';

// â”€â”€â”€ Output shape types (inferred from schema) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  statement?: string;
  statementRecordedAt?: Date;
  evidenceIds?: string[];
  appliedSections?: ILegalSectionSuggestion[];
  relationshipToIncident?: string;
}

export interface ParticipantFactsRow {
  participant_id: string;
  database_id: string;
  name: string;
  roles: ParticipantRole[];
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  identifiers: Array<{ type: string; value: string }>;
  victim_profile?: ParticipantProfileFacts;
  witness_profile?: ParticipantProfileFacts;
  suspect_profile?: ParticipantProfileFacts;
  accused_profile?: ParticipantProfileFacts;
  complainant_profile?: ParticipantProfileFacts;
  evidence_ids: string[];
  evidence: EvidenceRow[];
  // metadata: {
  //   created_at?: Date;
  //   updated_at?: Date;
  // };
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
  recent_diary: DiaryRow[];
}

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RECENT_DIARY_LIMIT = 20;

// â”€â”€â”€ Main function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function buildFactsObject(caseId: string): Promise<FactsObject> {
  const oid = new mongoose.Types.ObjectId(caseId);

  // Run all 5 queries in parallel â€” no sequential dependency.
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

  // â”€â”€ Checklist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Entities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Evidence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Participants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      identifiers: (participant.identifiers ?? []).map((identifier) => ({ type: identifier.type, value: identifier.value })),
      victim_profile: baseProfile(participant.victimProfile) as ParticipantProfileFacts | undefined,
      witness_profile: participant.witnessProfile ? {
        statement: participant.witnessProfile.statement,
        statementRecordedAt: participant.witnessProfile.statementRecordedAt,
        evidenceIds: (participant.witnessProfile.evidenceIds ?? []).map((evidenceId) => evidenceId.toString()),
      } : undefined,
      suspect_profile: participant.suspectProfile ? {
        appliedSections: participant.suspectProfile.appliedSections ?? [],
      } : undefined,
      accused_profile: participant.accusedProfile ? {
        appliedSections: participant.accusedProfile.appliedSections ?? [],
      } : undefined,
      complainant_profile: participant.complainantProfile ? {
        relationshipToIncident: participant.complainantProfile.relationshipToIncident,
      } : undefined,
      evidence_ids: linkedEvidence.map((evidence) => evidence.evidence_id),
      evidence: linkedEvidence,
      // metadata: {
      //   created_at: participant.createdAt,
      //   updated_at: participant.updatedAt,
      // },
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

  // â”€â”€ Department requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Recent diary (reverse back to chronological) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    complaint: complaintFacts,
    checklist:           { summary: checklistSummary, steps },
    entities:            { by_type: byType, raw: rawEntities },
    evidence:            { summary: evSummary, items: evItems },
    participants:        { total: participantRows.length, by_role: participantsByRole, raw: participantRows, summary: participantSummary },
    department_requests: { summary: reqSummary, items: reqItems },
    recent_diary:        recentDiary,
  };
}
/**
 * Prompt builder for the investigation orchestrator.
 * Separates concerns between the fast formatting pass and the deep reasoning pass.
 */

import { FactsObject } from './factsAssemblyService';
import { ConfidenceBreakdown } from './confidenceScoringService';

export interface PromptPayload {
  system: string;
  user: string;
}

// Single source of truth for requirement 5 â€” used in both deep and correction prompts
const DEPT_ENTITY_ID_INSTRUCTION = (validEntityIds: string) =>
  `5. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" ` +
  `and "department_entity_id" to an EXACT entity_id from this whitelist (format: id â†’ name):\n` +
  `${validEntityIds}\n` +
  `Only use entity_id values from that list. Never invent department names. ` +
  `If no relevant department applies, set "department_entity_id" to null. ` +
  `If it requires the complainant to provide info, set "target" to "complainant". ` +
  `Otherwise leave target blank for IO internal tasks.`;

export function buildFastPrompt(facts: any, retrievedChunks: any, language: string = 'en'): { system: string, user: string } {
  const system = `You are a fast, efficient AI assistant helping organize investigation data.
Your task is to take raw case facts and retrieved legal/SOP chunks and format them cleanly.
Keep your output concise and directly address the data.
IMPORTANT: You must provide your response directly in the following language code: ${language}. Do not use English unless the language code is 'en'.`;

  const user = `Here are the current case facts:
${JSON.stringify(facts, null, 2)}

Here are the retrieved legal and SOP chunks:
${JSON.stringify(retrievedChunks, null, 2)}

Please summarize what has changed and format these retrieved chunks into readable candidate steps.`;

  return { system, user };
}

export function buildDeepPrompt(
  facts: FactsObject,
  legalAgentResult: any,
  // recommendationResult: any,
  confidenceBreakdown: ConfidenceBreakdown,
  deptEntityWhitelist: string = '(no departments available)',
  language: string = 'en'
): PromptPayload {
  const system = `You are a Senior Investigative Officer AI. 
Your job is to read case facts, SOPs (legal agent), similar historical cases (recommendations), and a computed algorithmic confidence breakdown, then generate a strict JSON response.
DO NOT invent confidence numbers from thin air. You must reference the provided "confidenceBreakdown" in your narrative_summary.
Applicable legal sections remain at the CASE level only. Do not attach them to suspects or accused. The legal sections in the output are the single source of truth for the case.

REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema provided below.
2. ranked_next_steps MUST be highly detailed, case-specific, and actionable. You MUST invent custom, precise steps tailored to the Case Facts. For example, instead of a generic "Review Evidence", write "Cross-check WhatsApp screenshots and freeze HDFC bank account ending in 1234". If a phone number is present in the facts, add a step to "Request CDR for phone number X". DO NOT output generic, vague steps.
3. narrative_summary MUST act as an intelligent investigative assistant. It must explain the current state of the investigation, explicitly mention the factors from the confidence breakdown (evidence coverage, checklist progress, corroboration, contradictions), and clearly outline potential risks or gaps in the investigation.
4. suggested_legal_sections MUST provide the full case-level list of applicable legal sections supported by the provided legal context. Return an array of objects, not strings. Each object must contain:
- code
- title
- reason
If multiple sections apply, include all of them. Do not collapse the output to a single section just because a suspect or accused participant is present.
${DEPT_ENTITY_ID_INSTRUCTION(deptEntityWhitelist)}
5. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.
6. participant_recommendations MUST identify all relevant investigation participants, not only suspects. Use the provided facts, including complaint details, case participants grouped by role, evidence links, diary entries, checklist progress, entities, and retrieval context. Each recommendation must include:
- name
- roles
- confidence
- reason
- supporting_evidence_ids
- contradicting_evidence_ids
Only include recommended_sections when the roles include Suspect or Accused, and every code in recommended_sections must be a BNS code from the retrieved legal context. These are AI suggestions only and must NOT update CaseParticipants automatically. For Suspect or Accused recommendations, include at least two relevant BNS sections when the legal context supports them; for Witness, Victim, or Complainant roles, leave recommended_sections empty.
7. evidence_section_recommendations MUST identify applicable BSA sections for each evidence item. Use the evidence metadata and the legal context to map each evidence to its most relevant statutory provisions. Each entry must include:
- evidence_id
- evidence_title
- applicable_sections (array of objects with code, title, reason)
Only include sections that are supported by the legal context. Do not invent BSA sections. Use the evidence list from the facts and keep the output grounded in the current case evidence. Never mix BSA and BNS sections in the same recommendation set; suspects/accused must receive BNS only, while evidence must receive BSA only.
8. suggested_legal_sections MUST ONLY contain statutory provisions present in the provided Legal Context. Select only the provisions applicable to the current case facts. Do NOT invent statutory sections. Each section must contain:
- code
- title
- reason
Return all applicable sections as separate objects in the array. Do not trim the list down to one entry.

8. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" and "department_entity_id" to the name of the department (e.g., BANK, ISP, TELECOM). If it requires the complainant to provide info, set "target" to "complainant". Otherwise leave target blank for IO internal tasks.
9. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.
10. IMPORTANT: You must provide your textual responses (reason, title, narrative_summary, etc.) directly in the following language code: ${language}. Do not use English unless the language code is 'en'.

JSON SCHEMA:
{
  "ranked_next_steps": [
    { 
      "step_id": "step_abc", 
      "reason": "why this is next", 
      "confidence": 95, 
      "evidence_needed": ["bank statement"],
      "target": "department_entity",
      "department_entity_id": "bank_generic" 
    }
  ],
  "participant_recommendations": [
    {
      "name": "Rahul",
      "roles": ["Witness"],
      "confidence": 0.95,
      "reason": "...",
      "supporting_evidence_ids": ["ev1"],
      "contradicting_evidence_ids": [],
      "recommended_sections": [
        {
          "code": "BNS-117",
          "title": "Cheating",
          "reason": "Specific reason why this section applies to this participant..."
        }
      ]
    }
  ],
  "evidence_section_recommendations": [
    {
      "evidence_id": "EV-001",
      "evidence_title": "Suspicious payment screenshot",
      "applicable_sections": [
        {
          "code": "BSA-117",
          "title": "Single line telling about the BSA section",
          "reason": "Detailed reason why this section holds for this evidence."
        }
      ]
    }
  ],
  "suggested_legal_sections": [
  {
    "code": "BNS-117",
    "title": "Cheating",
    "reason": "Victim was dishonestly induced..."
  }
]
  "narrative_summary": "Comprehensive explanation of case status, what to do next, potential risks, and confidence breakdown..."
}`;

  const user = `Here is the current case state.

=== FACTS ===
${JSON.stringify(facts, null, 2)}

=== EVIDENCE ITEMS ===
${JSON.stringify((facts?.evidence?.items || []).map((item: any) => ({
  ...item,
  applicable_sections: item.applicable_sections || item.applicableSections || []
})), null, 2)}

=== ALGORITHMIC CONFIDENCE BREAKDOWN ===
${JSON.stringify(confidenceBreakdown, null, 2)}

=== LEGAL / SOP CONTEXT ===
${JSON.stringify(legalAgentResult, null, 2)}

Produce the JSON object now.`;

  return { system, user };
}

export function buildCorrectionPrompt(
  facts: FactsObject,
  originalSnapshot: any,
  correctionMessage: string,
  deptEntityWhitelist: string = '(no departments available)',
): PromptPayload {
  const system = `You are a Senior Investigative Officer AI handling a manual override from a human officer.
You generated a previous analysis, but the human officer has provided a correction message.
Your job is to read the previous facts used, your original analysis, and the officer's correction.

REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema below.
2. Revise your previous analysis to be completely consistent with the officer's correction.
3. DO NOT contradict facts that you have no reason to doubt. Focus on integrating the officer's correction gracefully.
4. ranked_next_steps MUST ONLY use steps from the provided SOPs (from the original facts or previous steps).
${DEPT_ENTITY_ID_INSTRUCTION(deptEntityWhitelist)}
5. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.
6. participant_recommendations MUST be updated only as a recommendation set. Do not create or modify CaseParticipants in the output narrative or reasoning.
7. For participant_recommendations, only include recommended_sections for Suspect or Accused roles, and only use BNS codes. For those sensitive roles, include at least two BNS sections when supported by the legal context; for Witness, Victim, or Complainant roles, leave recommended_sections empty.
8. For evidence_section_recommendations, return a section list for each evidence item using the current case evidence and the provided legal context. Preserve any sections already present in the previous analysis output when they still apply, and add or refine sections if needed. Evidence sections must be BSA only, never BNS.
9. For suggested_legal_sections, return an array of objects with code/title/reason and include every relevant case-level section the legal context supports. Do not reduce this to just one item.
10. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" and "department_entity_id" to the name of the department (e.g., BANK, ISP, TELECOM). If it requires the complainant to provide info, set "target" to "complainant". Otherwise leave target blank for IO internal tasks.
11. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.

JSON SCHEMA:
{
  "ranked_next_steps": [
    { 
      "step_id": "step_abc", 
      "reason": "why this is next", 
      "confidence": 95, 
      "evidence_needed": ["bank statement"],
      "target": "department_entity",
      "department_entity_id": "bank_generic" 
    }
  ],
  "participant_recommendations": [
    {
    "name": "...",
    "roles": ["Witness"],
    "confidence": 0.95,
    "reason": "...",
    "supporting_evidence_ids": [...],
    "contradicting_evidence_ids": [...],
    "recommended_sections": [
      {
        "code": "BNS-117",
        "title": "Cheating",
        "reason": "Specific reason..."
      }
    ]
}
  ],
  "evidence_section_recommendations": [
    {
      "evidence_id": "EV-001",
      "evidence_title": "Suspicious payment screenshot",
      "applicable_sections": [
        {
          "code": "BSA-117",
          "title": "Single line telling about the BSA section",
          "reason": "Detailed reason why this section holds for this evidence."
        }
      ]
    }
  ],
  "narrative_summary": "Explanation of case status..."
}`;

  const user = `Here is the current case state.

=== PREVIOUS FACTS ===
${JSON.stringify(facts, null, 2)}

=== PREVIOUS ANALYSIS OUTPUT ===
${JSON.stringify({
    ranked_next_steps: originalSnapshot.ranked_next_steps,
    suggested_legal_sections: originalSnapshot.suggested_legal_sections,
    participant_recommendations: originalSnapshot.participant_recommendations,
    evidence_section_recommendations: originalSnapshot.evidence_section_recommendations,
    narrative_summary: originalSnapshot.narrative_summary
  }, null, 2)}

=== HUMAN OFFICER CORRECTION ===
${correctionMessage}

Produce the revised JSON object now.`;

  return { system, user };
}
import { FactsObject } from './factsAssemblyService';

export interface ConfidenceBreakdown {
  evidence_coverage: number;
  checklist_progress: number;
  corroboration: number;
  contradiction_penalty: number;
  final_score: number;
}

export function computeConfidenceScore(facts: FactsObject): ConfidenceBreakdown {
  // 1. Evidence coverage
  // (required_evidence_present / required_evidence_total)
  let requiredTotal = 0;
  let requiredPresent = 0;

  facts.checklist.steps.forEach(step => {
    if (step.required_evidence && step.required_evidence.length > 0) {
      requiredTotal += step.required_evidence.length;
      // Count how many required evidence items have been fulfilled (roughly estimated by proof_evidence_ids)
      requiredPresent += Math.min(step.proof_evidence_ids.length, step.required_evidence.length);
    }
  });
  
  const evidence_coverage = requiredTotal > 0 ? requiredPresent / requiredTotal : 1.0;

  // 2. Checklist progress
  // (completed_steps weighted by criticality) / (total steps weighted by criticality)
  const criticalityWeight = {
    high: 3,
    medium: 2,
    low: 1
  };

  let progressTotal = 0;
  let progressCompleted = 0;

  facts.checklist.steps.forEach(step => {
    const weight = criticalityWeight[step.criticality as keyof typeof criticalityWeight] || 1;
    progressTotal += weight;
    if (step.status === 'completed') {
      progressCompleted += weight;
    }
  });

  const checklist_progress = progressTotal > 0 ? progressCompleted / progressTotal : 0.0;

  // 3. Corroboration
  // min(1.0, independent_evidence_sources_pointing_to_same_entity / 3)
  let maxCorroboration = 0;
  facts.entities.raw.forEach(entity => {
    if (entity.corroborating_evidence_ids && entity.corroborating_evidence_ids.length > maxCorroboration) {
      maxCorroboration = entity.corroborating_evidence_ids.length;
    }
  });
  const corroboration = Math.min(1.0, maxCorroboration / 3);

  // 4. Contradiction Penalty
  // -0.15 per unresolved contradicting evidence item
  // Note: Since contradicting evidence isn't currently tracked in FactsObject, this defaults to 0.
  const contradiction_penalty = 0.0;

  // Weighted sum
  // According to formula: confidence_score = weighted_sum(...)
  // We'll use balanced weights for now: 40% evidence, 40% checklist, 20% corroboration
  const baseScore = (evidence_coverage * 0.4) + (checklist_progress * 0.4) + (corroboration * 0.2);
  const final_score = Math.max(0, Math.min(1.0, baseScore - contradiction_penalty));

  return {
    evidence_coverage,
    checklist_progress,
    corroboration,
    contradiction_penalty,
    final_score
  };
}
import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

const TIMEOUT_MS = 300000; // 300s timeout to allow for first-time ONNX export

/**
 * Thin client wrapper for the legal_agent FastAPI service.
 * Handles timeouts and degrades gracefully rather than crashing.
 */
export async function callLegalAgent(query: string): Promise<Record<string, any>> {
  try {
    const response = await axios.post(
      `${env.LEGAL_AGENT_URL}/copilot`,
      { query },
      { timeout: TIMEOUT_MS }
    );
    return response.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('legal_agent call failed or timed out', { details: msg });
    
    // Circuit-breaker style fallback: return empty/flagged result
    return {
      _fallback_used: true,
      error: 'legal_agent unavailable',
      retrieved_chunks: [],
      legal_basis: []
    };
  }
}
import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

const TIMEOUT_MS = 15000; // 15s timeout

/**
 * Handles timeouts and degrades gracefully so the orchestrator can continue.
 */
export async function callIoRecommendation(query: any): Promise<Record<string, any>> {
  try {
    // The Python io-recommendation service expects a complex RecommendOfficersRequest
    // (with complaint and availableOfficers). If the orchestrator is passing a simple
    // string query to find similar cases, the Python endpoint will reject it with a 422.
    // For now, bypass the call for simple string queries to avoid the 422 error log.
    if (typeof query === 'string') {
       throw new Error('Not implemented: The Python service does not yet support string-based similar case search.');
    }

    const response = await axios.post(
      `${env.IO_RECOMMENDATION_URL}/recommend-officers`,
      query, // Assuming when it's not a string, it's the correct RecommendOfficersRequest payload
      { timeout: TIMEOUT_MS }
    );
    return response.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('io-recommendation call failed or timed out', { details: msg });
    
    // Circuit-breaker style fallback: return empty/flagged result
    return {
      _fallback_used: true,
      error: 'io-recommendation unavailable',
      similar_cases: [] // assuming the orchestrator expects something like this
    };
  }
}
