import { FactsObject } from './factsAssemblyService';

export interface ConfidenceBreakdown {
  evidence_coverage: number;
  checklist_progress: number;
  corroboration: number;
  contradiction_penalty: number;
  final_score: number;
  accused_identification_confidence?: any;
}

export function computeConfidenceScore(facts: FactsObject): ConfidenceBreakdown {
  // Dynamic Score Calculation
  
  // 1. Evidence Coverage
  // Based on the sheer volume of evidence vs participants.
  const numEvidence = facts.evidence?.items?.length || 0;
  const numParticipants = facts.participants?.raw?.length || 1;
  // If we have at least 1.5 pieces of evidence per participant, coverage is 100%
  const targetEvidence = numParticipants * 1.5;
  const evidence_coverage = Math.min(1.0, numEvidence / (targetEvidence || 1));

  // 2. Checklist Progress
  let progressTotal = 0;
  let progressCompleted = 0;
  if (facts.checklist?.steps && facts.checklist.steps.length > 0) {
    facts.checklist.steps.forEach(step => {
      progressTotal += 1;
      if (step.status === 'completed') progressCompleted += 1;
    });
  } else {
    // If no steps, fallback to evidence coverage
    progressTotal = 1;
    progressCompleted = evidence_coverage > 0.5 ? 1 : 0;
  }
  const checklist_progress = progressTotal > 0 ? progressCompleted / progressTotal : 0.0;

  // 3. Corroboration
  // We count evidence that has AI tags or applicable sections, or linked participants.
  let corroborationPoints = 0;
  if (facts.evidence && facts.evidence.items) {
    facts.evidence.items.forEach((ev: any) => {
      if (ev.ai_tags && ev.ai_tags.length > 0) corroborationPoints += 0.5;
      if (ev.applicable_sections && ev.applicable_sections.length > 0) corroborationPoints += 1;
      if (ev.related_participant_ids && ev.related_participant_ids.length > 0) corroborationPoints += 1;
    });
  }
  const corroboration = Math.min(1.0, corroborationPoints / 5);

  // 4. Contradictions
  const contradiction_penalty = 0.0;

  // Weighted Final Score
  const baseScore = (evidence_coverage * 0.4) + (checklist_progress * 0.4) + (corroboration * 0.2);
  const final_score = Math.max(0, Math.min(1.0, baseScore - contradiction_penalty));

  return {
    evidence_coverage,
    checklist_progress,
    corroboration: Math.round(corroborationPoints), // Return the raw points for UI "+X" display
    contradiction_penalty,
    final_score
  };
}