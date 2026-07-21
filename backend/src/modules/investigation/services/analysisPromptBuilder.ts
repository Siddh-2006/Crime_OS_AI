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

export function buildFastPrompt(facts: any, retrievedChunks: any): { system: string, user: string } {
  const system = `You are a fast, efficient AI assistant helping organize investigation data.
Your task is to take raw case facts and retrieved legal/SOP chunks and format them cleanly.
Keep your output concise and directly address the data.`;

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
  recommendationResult: any,
  confidenceBreakdown: ConfidenceBreakdown
): PromptPayload {
  const system = `You are a Senior Investigative Officer AI. 
Your job is to read case facts, SOPs (legal agent), similar historical cases (recommendations), and a computed algorithmic confidence breakdown, then generate a strict JSON response.
DO NOT invent confidence numbers from thin air. You must reference the provided "confidenceBreakdown" in your narrative_summary.
Applicable legal sections remain at the CASE level only. Do not attach them to suspects or accused. The legal sections in the output are the single source of truth for the case.

REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema provided below.
2. ranked_next_steps MUST be highly detailed, case-specific, and actionable. You MUST invent custom, precise steps tailored to the Case Facts. For example, instead of a generic "Review Evidence", write "Cross-check WhatsApp screenshots and freeze HDFC bank account ending in 1234". If a phone number is present in the facts, add a step to "Request CDR for phone number X". DO NOT output generic, vague steps.
3. narrative_summary MUST act as an intelligent investigative assistant. It must explain the current state of the investigation, explicitly mention the factors from the confidence breakdown (evidence coverage, checklist progress, corroboration, contradictions), and clearly outline potential risks or gaps in the investigation.
4. participant_recommendations MUST identify all relevant investigation participants, not only suspects. Use the provided facts, including complaint details, case participants grouped by role, evidence links, diary entries, checklist progress, entities, and retrieval context. Each recommendation must include:
- name
- roles
- confidence
- reason
- supporting_evidence_ids
- contradicting_evidence_ids
Only include recommended_sections when the roles include Suspect or Accused, and every code in recommended_sections must be a BNS code from the retrieved legal context. These are AI suggestions only and must NOT update CaseParticipants automatically.
5. suggested_legal_sections MUST ONLY contain statutory provisions present in the provided Legal Context. Select only the provisions applicable to the current case facts. Do NOT invent statutory sections. Each section must contain:
- code
- title
- reason

6. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" and "department_entity_id" to the name of the department (e.g., BANK, ISP, TELECOM). If it requires the complainant to provide info, set "target" to "complainant". Otherwise leave target blank for IO internal tasks.
7. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.

JSON SCHEMA:
{
  "ranked_next_steps": [
    { 
      "step_id": "step_abc", 
      "reason": "why this is next", 
      "confidence": 95, 
      "evidence_needed": ["bank statement"],
      "target": "department_entity",
      "department_entity_id": "BANK" 
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
      "recommended_sections": []
    }
  ],
  "suspect_candidates": [
    {
  "entity": "Rahul",

  "confidence": 85,

  "supporting_evidence_ids": ["ev1"],

  "contradicting_evidence_ids": [],

  "recommended_sections": [
    "BNS-117",
    "BNS-304"
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

=== ALGORITHMIC CONFIDENCE BREAKDOWN ===
${JSON.stringify(confidenceBreakdown, null, 2)}

=== LEGAL / SOP CONTEXT ===
${JSON.stringify(legalAgentResult, null, 2)}

=== SIMILAR CASE RECOMMENDATIONS ===
${JSON.stringify(recommendationResult, null, 2)}

Produce the JSON object now.`;

  return { system, user };
}

export function buildCorrectionPrompt(
  facts: FactsObject,
  originalSnapshot: any,
  correctionMessage: string
): PromptPayload {
  const system = `You are a Senior Investigative Officer AI handling a manual override from a human officer.
You generated a previous analysis, but the human officer has provided a correction message.
Your job is to read the previous facts used, your original analysis, and the officer's correction.

REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema below.
2. Revise your previous analysis to be completely consistent with the officer's correction.
3. DO NOT contradict facts that you have no reason to doubt. Focus on integrating the officer's correction gracefully.
4. ranked_next_steps MUST ONLY use steps from the provided SOPs (from the original facts or previous steps).
5. participant_recommendations MUST be updated only as a recommendation set. Do not create or modify CaseParticipants in the output narrative or reasoning.
6. For participant_recommendations, only include recommended_sections for Suspect or Accused roles, and only use BNS codes.
7. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" and "department_entity_id" to the name of the department (e.g., BANK, ISP, TELECOM). If it requires the complainant to provide info, set "target" to "complainant". Otherwise leave target blank for IO internal tasks.
8. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.

JSON SCHEMA:
{
  "ranked_next_steps": [
    { 
      "step_id": "step_abc", 
      "reason": "why this is next", 
      "confidence": 95, 
      "evidence_needed": ["bank statement"],
      "target": "department_entity",
      "department_entity_id": "BANK" 
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
    "recommended_sections": []
}
  ],
  "suspect_candidates": [
    {
    "entity": "...",
    "confidence": ...,
    "supporting_evidence_ids": [...],
    "contradicting_evidence_ids": [...],
    "recommended_sections": [
        "BNS-117"
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
    suspect_candidates: originalSnapshot.suspect_candidates,
    suggested_legal_sections: originalSnapshot.suggested_legal_sections,
    participant_recommendations: originalSnapshot.participant_recommendations,
    narrative_summary: originalSnapshot.narrative_summary
  }, null, 2)}

=== HUMAN OFFICER CORRECTION ===
${correctionMessage}

Produce the revised JSON object now.`;

  return { system, user };
}
