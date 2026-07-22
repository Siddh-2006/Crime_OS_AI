import { v4 as uuidv4 } from 'uuid';
import { buildFactsObject } from './factsAssemblyService';
import { callLegalAgent } from '../../../shared/clients/legalAgentClient';
// import { callIoRecommendation } from '../../../shared/clients/ioRecommendationClient';
import { buildFastPrompt, buildDeepPrompt, buildCorrectionPrompt } from './analysisPromptBuilder';
import { computeConfidenceScore } from './confidenceScoringService';
import { fastCall, deepCall } from '../../../shared/llm/ollamaClient';
import { AnalysisSnapshot, IParticipantRecommendation, ISuspectCandidate, ParticipantRecommendationRole } from '../models/AnalysisSnapshot.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { Escalation } from '../models/Escalation.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { EmailQueue } from '../../../shared/queue/EmailQueue';
import { publishProgress } from '../../../shared/utils/analysisProgress';
import { ILegalSectionSuggestion } from '../models/LegalSection.schema';

import logger from '../../../config/logger';

function normalizeSuggestedLegalSections(sections: unknown): ILegalSectionSuggestion[] {
  if (!Array.isArray(sections)) return [];

  return sections.flatMap((section): ILegalSectionSuggestion[] => {
    if (typeof section === 'string') {
      return [{ code: section, title: section }];
    }
    
    if (!section || typeof section !== 'object') return [];

    const candidate = section as Record<string, unknown>;
    if (typeof candidate.code !== 'string' || typeof candidate.title !== 'string') return [];

    return [{
      code: candidate.code,
      title: candidate.title,
      ...(typeof candidate.reason === 'string' ? { reason: candidate.reason } : {}),
    }];
  });
}

function normalizeParticipantRoles(roles: unknown): ParticipantRecommendationRole[] {
  if (!Array.isArray(roles)) return [];

  const allowedRoles: ParticipantRecommendationRole[] = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'];
  return Array.from(new Set(
    roles.filter((role): role is ParticipantRecommendationRole => typeof role === 'string' && allowedRoles.includes(role as ParticipantRecommendationRole))
  ));
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
  static async runAnalysis(caseId: string): Promise<any> {
    logger.info(`[Orchestrator] ▶ Starting analysis for caseId: ${caseId}`);

    // 1. Facts Assembly
    logger.info(`[Orchestrator] [1/7] Assembling facts from MongoDB for caseId: ${caseId}`);
    const factsObject = await buildFactsObject(caseId);
    logger.info(`[Orchestrator] [1/7] Facts assembled — checklist: ${factsObject.checklist.summary.total} steps, evidence: ${factsObject.evidence.summary.total} items, diary: ${factsObject.recent_diary.length} entries`);
    await publishProgress(caseId, 'facts_assembled');

    // 2. Retrieval
    const queryStr = `Blocked Steps: ${factsObject.checklist.summary.blocked}. Pending High Criticality: ${factsObject.checklist.summary.high_criticality_pending}.`;
    logger.info(`[Orchestrator] [2/7] Dispatching concurrent retrieval calls — legal agent + IO recommendation`);
    
    const [legalAgentResult] = await Promise.all([
      callLegalAgent(queryStr),
      // callIoRecommendation(queryStr)
    ]);
    const legalFallback = (legalAgentResult as any)._fallback_used;
    // const ioFallback    = (recommendationResult as any)._fallback_used;
    logger.info(`[Orchestrator] [2/7] Retrieval done — legal agent: ${legalFallback ? 'FALLBACK' : `${(legalAgentResult as any).retrieved_chunks?.length ?? 0} chunks`}`);
    // logger.info(`[Orchestrator] [2/7] Retrieval done — legal agent: ${legalFallback ? 'FALLBACK' : `${(legalAgentResult as any).retrieved_chunks?.length ?? 0} chunks`}, IO recommendation: ${ioFallback ? 'FALLBACK' : 'OK'}`);
    await publishProgress(caseId, 'legal_retrieved');

    // 3. Confidence scoring (deterministic, no LLM)
    logger.info(`[Orchestrator] [3/7] Computing algorithmic confidence score`);
    const confidenceBreakdown = computeConfidenceScore(factsObject);
    logger.info(`[Orchestrator] [3/7] Confidence: evidence=${(confidenceBreakdown.evidence_coverage * 100).toFixed(0)}% checklist=${(confidenceBreakdown.checklist_progress * 100).toFixed(0)}% final=${(confidenceBreakdown.final_score * 100).toFixed(0)}%`);
    await publishProgress(caseId, 'confidence_scored');

    // 4. Fast LLM pass
    logger.info(`[Orchestrator] [4/7] Running fast model pass (temp=0.3, max_tokens=512)`);
    const fastPrompt = buildFastPrompt(factsObject, legalAgentResult);
    const fastResponse = await fastCall(fastPrompt.system, fastPrompt.user) as string;
    logger.info(`[Orchestrator] [4/7] Fast pass complete — response length: ${fastResponse?.length ?? 0} chars`);
    await publishProgress(caseId, 'fast_pass_done');

    // 5. Deep LLM pass
    logger.info(`[Orchestrator] [5/7] Running deep model pass (temp=0.1, max_tokens=1024, jsonMode=true)`);

    // Fetch active department entity IDs to ground the LLM — prevents hallucinated entity IDs
    const { DepartmentRegistry } = await import('../../admin/models/DepartmentRegistry.model');
    const activeDepts = await DepartmentRegistry.find({ isActive: true }, { entity_id: 1, entity_name: 1 }).lean();
    const deptWhitelist = activeDepts.map((d: any) => `  ${d.entity_id} → ${d.entity_name}`).join('\n');
    logger.debug(`[Orchestrator] Dept whitelist: ${activeDepts.length} active departments`);

    const deepPrompt = buildDeepPrompt(factsObject, legalAgentResult, confidenceBreakdown, deptWhitelist);
    // const deepPrompt = buildDeepPrompt(factsObject, legalAgentResult, recommendationResult, confidenceBreakdown, deptWhitelist);
    const deepResponse = await deepCall(deepPrompt.system, deepPrompt.user, { jsonMode: true }) as any;

    if (!deepResponse || !deepResponse.ranked_next_steps) {
      logger.error(`[Orchestrator] [5/7] Deep model returned invalid/empty JSON. Response: ${JSON.stringify(deepResponse)?.slice(0, 200)}`);
      throw new Error(`[Orchestrator] Deep model failed to return valid JSON structure.`);
    }
    logger.info(`[Orchestrator] [5/7] Deep pass complete — ${deepResponse.ranked_next_steps?.length ?? 0} steps, ${deepResponse.suspect_candidates?.length ?? 0} suspects`);
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
    const suggested_legal_sections = normalizeSuggestedLegalSections(deepResponse.suggested_legal_sections);

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger: 'manual',
      facts_used: factsObject,
      ranked_next_steps,
      suspect_candidates: normalizedSuspectCandidates,
      participant_recommendations: normalizedParticipantRecommendations,
      narrative_summary: deepResponse.narrative_summary || fastResponse,
      suggested_legal_sections: deepResponse.suggested_legal_sections || [],
      confidence_breakdown: confidenceBreakdown,
      officer_authored: false,
      parent_snapshot_id: previousSnapshot?._id || undefined,
    });
    const savedSnapshot = await newSnapshot.save();
    logger.info(`[Orchestrator] [6/7] Snapshot saved — id: ${savedSnapshot.snapshot_id}`);
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
    logger.info(`[Orchestrator] ✅ Analysis complete for caseId: ${caseId} — snapshot: ${savedSnapshot.snapshot_id}`);
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
    const suggested_legal_sections = normalizeSuggestedLegalSections(deepResponse.suggested_legal_sections);

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger: 'officer_override',
      facts_used: originalSnapshot.facts_used, // keep the same facts as the parent
      ranked_next_steps,
      suspect_candidates,
      participant_recommendations: normalizedParticipantRecommendations,
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
