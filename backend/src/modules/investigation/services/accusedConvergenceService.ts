export function computeAccusedConvergence(facts: any, previousSnapshot?: any): any {
  let identity_corroboration = 0;
  let response_verification = 0;
  let legal_element_coverage = 0.5; // default
  let identity_checklist_weight = 0.5; // default

  // Parse department requests
  const requests = facts.department_requests || [];
  const identityRelatedIds = ['uidai', 'rto', 'passport', 'telecom', 'bank', 'vahan', 'sarathi'];
  const identityRequests = requests.filter((r: any) => 
    identityRelatedIds.some(id => (r.department_entity_id || '').toLowerCase().includes(id))
  );

  const receivedIdentityRequests = identityRequests.filter((r: any) => r.status === 'response_received' || r.hasResponse);

  // 1. Identity Corroboration
  identity_corroboration = Math.min(receivedIdentityRequests.length, 3) / 3; // cap at 3

  // 2. Response Verification
  if (identityRequests.length > 0) {
    response_verification = receivedIdentityRequests.length / identityRequests.length;
  } else if (requests.length > 0) {
    // Fallback if no identity requests exist, use general requests
    const received = requests.filter((r: any) => r.status === 'response_received' || r.hasResponse);
    response_verification = received.length / requests.length;
  }

  // 3. Legal Element Coverage
  // Cross reference facts.complaint.legal_sections_history vs evidence linked to participants
  const sectionsStr = facts.complaint?.sections || facts.complaint?.legal_sections || facts.complaint?.legalSectionsHistory || '';
  const sections = Array.isArray(sectionsStr) ? sectionsStr : (typeof sectionsStr === 'string' ? sectionsStr.split(',') : []);
  if (sections.length > 0 && facts.evidence && facts.evidence.length > 0) {
    legal_element_coverage = Math.min(facts.evidence.length / 3, 1.0); // simple heuristic
  }

  // 4. Identity Checklist Weight
  const checklist = facts.checklist || [];
  const identitySteps = checklist.filter((c: any) => (c.title || '').toLowerCase().includes('identity') || (c.title || '').toLowerCase().includes('verify'));
  if (identitySteps.length > 0) {
    const completed = identitySteps.filter((c: any) => c.status === 'completed');
    identity_checklist_weight = completed.length / identitySteps.length;
  }

  // Calculate base score
  let score = (identity_corroboration * 0.3) + 
              (legal_element_coverage * 0.2) + 
              (response_verification * 0.3) + 
              (identity_checklist_weight * 0.2);

  // Contradiction Check
  let contradiction_detected = false;
  // Use confidence breakdown constraints or simple logic
  if (facts.participants) {
    contradiction_detected = facts.participants.some((p: any) => p.contradicting_evidence_ids?.length > 0);
  }
  
  const is_confirmed = response_verification === 1.0 && identity_corroboration >= 0.66;

  if (contradiction_detected) {
    score = Math.min(score, 0.35);
  }
  if (!is_confirmed) {
    score = Math.min(score, 0.85);
  }

  let level = 'low';
  if (score >= 0.7) level = 'high';
  else if (score >= 0.4) level = 'medium';

  // Delta & Trend
  let delta = 0;
  let trend = 'stable';
  if (previousSnapshot && previousSnapshot.accused_convergence && previousSnapshot.accused_convergence.score !== undefined) {
    delta = score - previousSnapshot.accused_convergence.score;
    if (delta > 0.03) trend = 'converging';
    else if (delta < -0.03) trend = 'diverging';
  }

  return {
    score: parseFloat(score.toFixed(2)),
    level,
    breakdown: {
      identity_corroboration: parseFloat(identity_corroboration.toFixed(2)),
      legal_element_coverage: parseFloat(legal_element_coverage.toFixed(2)),
      response_verification: parseFloat(response_verification.toFixed(2)),
      identity_checklist_weight: parseFloat(identity_checklist_weight.toFixed(2))
    },
    is_confirmed,
    delta: parseFloat(delta.toFixed(2)),
    trend
  };
}
