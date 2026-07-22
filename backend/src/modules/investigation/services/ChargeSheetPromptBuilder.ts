import { PromptPayload } from './analysisPromptBuilder';

export function buildChargeSheetPrompt(context: any): PromptPayload {
  const system = `You are a Senior Investigative Officer AI.
Your job is to read the fully assembled case context and generate the narrative sections of the final Charge Sheet.
The context includes complaint details, participants, evidence, department requests, diary entries, and legal sections.

REQUIREMENTS:
1. Output strictly valid JSON matching the exact schema provided below. Do not wrap JSON in markdown \`\`\` blocks, just return raw JSON text.
2. The LLM should ONLY generate narrative content. Do not infer or generate factual lists of participants, evidence, legal sections, or annexures.
3. Your JSON response must contain at minimum the following narrative fields:
   - briefCaseDescription: A concise summary of the incident and case background.
   - investigationSummary: A detailed narrative of the investigation process, steps taken, and evidence gathered.
   - investigationFindings: The conclusions drawn from the investigation, analyzing the evidence against the accused.
   - finalReport: The formal concluding prayer or request to the court (e.g., requesting cognizance of the offenses).

JSON SCHEMA:
{
  "briefCaseDescription": "...",
  "investigationSummary": "...",
  "investigationFindings": "...",
  "finalReport": "..."
}`;

  const user = `Here is the complete assembled investigation state:

${JSON.stringify(context, null, 2)}

Produce the JSON object now.`;

  return { system, user };
}
