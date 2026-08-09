import { FactsObject } from './factsAssemblyService';

export interface ConfidenceBreakdown {
  evidence_coverage: number;
  checklist_progress: number;
  corroboration: number;
  contradiction_penalty: number;
  final_score: number;
  accused_identification_confidence?: {
    identity_corroboration_count: number;
    legal_element_coverage: number;
    response_verification_completeness: number;
    contradiction_alibi_check: boolean; // True if contradiction exists
    critical_checklist_progress: number;
    is_fully_confirmed: boolean;
    score: number;
  };
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

  // --- Accused Identification Confidence (IO-Stage) ---
  let identityCorroborationCount = 0;
  let legalElementCoverage = 0; // simplified placeholder: would map evidence to sections
  let responseVerificationCompleteness = 0; // placeholder: ratio of KYC responses
  
  // Contradiction Check: If AI analysis flag found alibi/contradictions for the accused
  const contradictionAlibiCheck = false; // To be fed from AI case_understanding or evidence tags
  
  // Critical checklist completion
  let criticalTotal = 0;
  let criticalCompleted = 0;
  facts.checklist.steps.forEach(step => {
    if (step.criticality === 'high' || step.title.toLowerCase().includes('identity') || step.title.toLowerCase().includes('accused')) {
      criticalTotal++;
      if (step.status === 'completed') criticalCompleted++;
    }
  });
  const criticalChecklistProgress = criticalTotal > 0 ? criticalCompleted / criticalTotal : 0;

  // Identity Corroboration: count of verified evidence tied to the accused participant
  if (facts.participants && facts.participants.by_role && facts.participants.by_role.Accused) {
    facts.participants.by_role.Accused.forEach((accused: any) => {
      if (accused.evidence_ids && accused.evidence_ids.length > identityCorroborationCount) {
        identityCorroborationCount = accused.evidence_ids.length; // Count verified sources
      }
    });
  }

  // Hard Gate boolean logic for 100% confirmation
  const elementsCovered = legalElementCoverage >= 1.0; // Assume 1.0 means all elements covered
  
  const isFullyConfirmed = (identityCorroborationCount >= 2) && elementsCovered && !contradictionAlibiCheck;
  
  let accusedIdentificationScore = 0;
  if (isFullyConfirmed) {
    accusedIdentificationScore = 1.0;
  } else {
    // If not fully confirmed, cap at 0.85
    let baseIdScore = (identityCorroborationCount * 0.2) + (criticalChecklistProgress * 0.4) + (responseVerificationCompleteness * 0.4);
    if (contradictionAlibiCheck) {
      baseIdScore = Math.min(baseIdScore, 0.3); // Hard cap low if there's a contradiction
    }
    accusedIdentificationScore = Math.min(0.85, baseIdScore);
  }

  return {
    evidence_coverage,
    checklist_progress,
    corroboration,
    contradiction_penalty,
    final_score,
    accused_identification_confidence: {
      identity_corroboration_count: identityCorroborationCount,
      legal_element_coverage: legalElementCoverage,
      response_verification_completeness: responseVerificationCompleteness,
      contradiction_alibi_check: contradictionAlibiCheck,
      critical_checklist_progress: criticalChecklistProgress,
      is_fully_confirmed: isFullyConfirmed,
      score: accusedIdentificationScore
    }
  };
}
