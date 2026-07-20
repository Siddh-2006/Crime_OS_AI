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

REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema provided below.
2. ranked_next_steps MUST be highly detailed, case-specific, and actionable. You MUST invent custom, precise steps tailored to the Case Facts. For example, instead of a generic "Review Evidence", write "Cross-check WhatsApp screenshots and freeze HDFC bank account ending in 1234". If a phone number is present in the facts, add a step to "Request CDR for phone number X". DO NOT output generic, vague steps.
3. narrative_summary MUST act as an intelligent investigative assistant. It must explain the current state of the investigation, explicitly mention the factors from the confidence breakdown (evidence coverage, checklist progress, corroboration, contradictions), and clearly outline potential risks or gaps in the investigation.
4. suggested_legal_sections MUST provide a brief list of the applicable legal sections (e.g., IPC, IT Act) with a short explanation of why they apply. It MUST be an array of strings.
5. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" and "department_entity_id" to the name of the department (e.g., BANK, ISP, TELECOM). If it requires the complainant to provide info, set "target" to "complainant". Otherwise leave target blank for IO internal tasks.
6. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.

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
  "suspect_candidates": [
    { "entity": "account 123", "confidence": 85, "supporting_evidence_ids": ["ev1"], "contradicting_evidence_ids": [] }
  ],
  "suggested_legal_sections": [
    "Section 420 IPC: Explanation of why it applies",
    "66D IT Act: Explanation of why it applies"
  ],
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
5. For ranked_next_steps, if a step requires an external department, set "target" to "department_entity" and "department_entity_id" to the name of the department (e.g., BANK, ISP, TELECOM). If it requires the complainant to provide info, set "target" to "complainant". Otherwise leave target blank for IO internal tasks.
6. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.

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
  "suspect_candidates": [
    { "entity": "account 123", "confidence": 85, "supporting_evidence_ids": ["ev1"], "contradicting_evidence_ids": [] }
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
  narrative_summary: originalSnapshot.narrative_summary
}, null, 2)}

=== HUMAN OFFICER CORRECTION ===
${correctionMessage}

Produce the revised JSON object now.`;

  return { system, user };
}
