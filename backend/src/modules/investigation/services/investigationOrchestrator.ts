import { v4 as uuidv4 } from 'uuid';
import { buildFactsObject } from './factsAssemblyService';
import { callLegalAgent } from '../../../shared/clients/legalAgentClient';
import { callIoRecommendation } from '../../../shared/clients/ioRecommendationClient';
import { buildFastPrompt, buildDeepPrompt, buildCorrectionPrompt } from './analysisPromptBuilder';
import { computeConfidenceScore } from './confidenceScoringService';
import { fastCall, deepCall } from '../../../shared/llm/ollamaClient';
import { AnalysisSnapshot } from '../models/AnalysisSnapshot.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { Escalation } from '../models/Escalation.model';
import { EmailQueue } from '../../../shared/queue/EmailQueue';

import logger from '../../../config/logger';

export class InvestigationOrchestrator {
  /**
   * Executes the full orchestrator loop for a given case.
   */
  static async runAnalysis(caseId: string): Promise<any> {
    logger.info(`[Orchestrator] Starting analysis loop for caseId: ${caseId}`);
    
    // 1. Facts Assembly (pure data, no AI)
    const factsObject = await buildFactsObject(caseId);
    
    // 2. Retrieval Calls (concurrent)
    // Convert facts to a simple query string for retrieval
    const queryStr = `Blocked Steps: ${factsObject.checklist.summary.blocked}. Pending High Criticality: ${factsObject.checklist.summary.high_criticality_pending}.`;
    
    logger.debug(`[Orchestrator] Dispatching retrieval calls for caseId: ${caseId}`);
    const [legalAgentResult, recommendationResult] = await Promise.all([
      callLegalAgent(queryStr),
      callIoRecommendation(queryStr)
    ]);
    
    // 3. Fast Model Pass
    logger.debug(`[Orchestrator] Running Fast Model pass for caseId: ${caseId}`);
    const fastPrompt = buildFastPrompt(factsObject, legalAgentResult);
    const fastResponse = await fastCall(fastPrompt.system, fastPrompt.user) as string;
    
    // 4. Deep Model Pass
    logger.debug(`[Orchestrator] Running Deep Model pass for caseId: ${caseId}`);
    
    // Calculate algorithmic confidence score BEFORE calling the LLM
    const confidenceBreakdown = computeConfidenceScore(factsObject);
    
    const deepPrompt = buildDeepPrompt(factsObject, legalAgentResult, recommendationResult, confidenceBreakdown);
    // Request strictly parsed JSON output
    const deepResponse = await deepCall(deepPrompt.system, deepPrompt.user, { jsonMode: true }) as any;
    
    if (!deepResponse || !deepResponse.ranked_next_steps) {
      throw new Error(`[Orchestrator] Deep model failed to return valid JSON structure.`);
    }

    // 5. Persist Results (Transaction recommended, but keeping it simple for now)
    logger.debug(`[Orchestrator] Persisting AnalysisSnapshot for caseId: ${caseId}`);
    
    // Find previous snapshot to set parent chain
    const previousSnapshot = await AnalysisSnapshot.findOne({ case_id: caseId }).sort({ timestamp: -1 });

    // Normalize confidence from [0,100] to [0,1]
    const normalizeConfidence = (c: number) => c > 1 ? c / 100 : c;
    const ranked_next_steps = deepResponse.ranked_next_steps.map((step: any) => ({
      ...step,
      confidence: normalizeConfidence(step.confidence)
    }));
    const suspect_candidates = (deepResponse.suspect_candidates || []).map((cand: any) => ({
      ...cand,
      confidence: normalizeConfidence(cand.confidence)
    }));

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger: 'manual', // hardcoded to manual for /analyze endpoint
      facts_used: factsObject,
      ranked_next_steps,
      suspect_candidates,
      narrative_summary: deepResponse.narrative_summary || fastResponse,
      confidence_breakdown: confidenceBreakdown, // Using algorithmic breakdown per Section 6
      officer_authored: false,
      parent_snapshot_id: previousSnapshot?._id || undefined,
    });
    const savedSnapshot = await newSnapshot.save();

    // Append Diary Entry
    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'system', id: 'orchestrator' },
      event_type: 'analysis_run',
      payload: { snapshot_id: savedSnapshot._id.toString() },
      ref_ids: { snapshot_id: savedSnapshot._id.toString() }
    });

    // Update case_checklist statuses if analysis implies changes (noting logic here)
    // For now, only checklist items specifically addressed as "completed" inside analysis? 
    // Usually, human officer completes checklist. But if the model recommended steps, we might add them.
    // The pipeline doc says: "updates case_checklist statuses if the analysis implies changes"
    // Since deepResponse only *ranks* next steps, we'll leave existing statuses alone unless explicitly blocked.

    if (deepResponse.suggested_legal_sections) {
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
              content: deepResponse.suggested_legal_sections,
              timestamp: new Date()
            }
          }
        });
      }
    }

    // 6. Escalation Check
    await this.runEscalationCheck(caseId, savedSnapshot);

    logger.info(`[Orchestrator] Analysis complete for caseId: ${caseId}`);
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
    const suspect_candidates = (deepResponse.suspect_candidates || []).map((cand: any) => ({
      ...cand,
      confidence: normalizeConfidence(cand.confidence)
    }));

    const newSnapshot = new AnalysisSnapshot({
      case_id: caseId,
      snapshot_id: uuidv4(),
      trigger: 'officer_override',
      facts_used: originalSnapshot.facts_used, // keep the same facts as the parent
      ranked_next_steps,
      suspect_candidates,
      narrative_summary: deepResponse.narrative_summary,
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
    narrative_summary: string;
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
      narrative_summary: payload.narrative_summary,
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
