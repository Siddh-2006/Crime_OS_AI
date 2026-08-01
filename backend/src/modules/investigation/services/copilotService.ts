import { buildFactsObject } from './factsAssemblyService';
import { callLegalAgent } from '../../../shared/clients/legalAgentClient';
import { fastCall, deepCall } from '../../../shared/llm/ollamaClient';
import { DiaryEntry } from '../models/DiaryEntry.model';
import logger from '../../../config/logger';

export class CopilotService {
  /**
   * Ask the copilot a question.
   * Returns either a direct answer or a structured proposal block for state changes.
   */
  static async ask(caseId: string, message: string, language: string = 'en'): Promise<string> {
    logger.info(`[Copilot] Received question for caseId: ${caseId}`);

    // 1. Assemble full structured case facts (no AI)
    const facts = await buildFactsObject(caseId);

    // 2. Fetch last 30 diary entries with full payload
    const recentDiary = await DiaryEntry.find({ case_id: caseId })
      .sort({ timestamp: -1 })
      .limit(30)
      .lean();

    const diaryNarrative = recentDiary
      .reverse()
      .map((d: any) => {
        const actor = d.actor ? `${d.actor.type}:${d.actor.id}` : 'system';
        const time = new Date(d.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const payloadStr = d.payload
          ? Object.entries(d.payload as Record<string, unknown>)
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
              .join(', ')
          : '';
        return `[${time}] [${d.event_type}] by ${actor}${payloadStr ? ` | ${payloadStr}` : ''}`;
      })
      .join('\n');

    // 3. Complexity routing
    const isComplex = /\b(add|propose|draft|create|update|change|recommend|suggest|write|send|escalate|arrest)\b/i.test(message);

    // 4. Legal Agent RAG
    const queryStr = `${message} | Case category: ${(facts as any).complaint?.category ?? ''} | Place: ${(facts as any).complaint?.incident_place ?? ''}`;
    let legalContext = 'Not available (legal agent offline)';
    try {
      const legalResult = await callLegalAgent(queryStr);
      if (legalResult && typeof legalResult === 'object') {
        const chunks = (legalResult as any).retrieved_chunks ?? [];
        const basis = (legalResult as any).legal_basis ?? [];
        legalContext = chunks.length > 0
          ? `Legal Basis: ${basis.join(', ')}\n\nRelevant Sections:\n${chunks.slice(0, 5).join('\n---\n')}`
          : 'No relevant sections retrieved';
      }
    } catch {
      logger.warn('[Copilot] Legal Agent query failed. Proceeding without legal context.');
    }

    // 5. Build readable sections
    const c = (facts as any).complaint;
    const complaintOverview = c ? [
      `Case ID: ${caseId}`,
      `FIR No: ${c.complaint_number ?? 'Unknown'}`,
      `Category: ${c.category ?? c.crime_category ?? 'Unknown'}`,
      `Status: ${c.status ?? 'Unknown'}`,
      `Incident Date: ${c.incident_date ? new Date(c.incident_date).toLocaleDateString('en-IN') : 'Unknown'}`,
      `Incident Place: ${c.incident_place ?? 'Unknown'}`,
      `Short Description: ${c.short_description ?? ''}`,
      `Full Narrative: ${c.detailed_description ?? 'Not provided'}`,
    ].join('\n') : 'Complaint data not available';

    const p = (facts as any).participants;
    const participantSummary = p?.raw?.length > 0
      ? p.raw.map((pr: any) =>
          `- ${pr.name} [${pr.roles.join('/')}]${pr.contact?.phone ? ` | Phone: ${pr.contact.phone}` : ''}${
            pr.suspect_profile?.appliedSections?.length
              ? ` | Sections: ${pr.suspect_profile.appliedSections.map((s: any) => s.code).join(', ')}`
              : ''
          }`
        ).join('\n')
      : 'No participants added yet';

    const cl = (facts as any).checklist;
    const checklistSummary = cl
      ? [
          `Progress: ${cl.summary.completion_pct.toFixed(0)}% | Total: ${cl.summary.total} | Done: ${cl.summary.completed} | Pending: ${cl.summary.pending} | Blocked: ${cl.summary.blocked}`,
          `High-criticality pending: ${cl.summary.high_criticality_pending}`,
          cl.steps.map((s: any) => `  [${s.status.toUpperCase()}] ${s.title} (${s.criticality ?? 'normal'})`).join('\n'),
        ].join('\n')
      : 'No checklist generated yet. Run AI Analysis first.';

    const ev = (facts as any).evidence;
    const evidenceSummary = ev?.items?.length > 0
      ? [
          `Total: ${ev.summary.total} | Verified: ${ev.summary.verified} | Pending: ${ev.summary.pending}`,
          ev.items.slice(0, 10).map((e: any) => `  [${e.status}] ${e.type}: ${e.ai_description ?? 'No desc'} | Tags: ${(e.ai_tags ?? []).join(', ')}`).join('\n'),
        ].join('\n')
      : 'No evidence recorded yet';

    const dr = (facts as any).department_requests;
    const deptSummary = dr
      ? `Sent: ${dr.summary.sent} | Responses: ${dr.summary.response_received} | Overdue: ${dr.summary.overdue}`
      : 'None';

    const systemPrompt = `You are INVESTIGATOR AI — an expert AI Copilot inside CRIME OS, the digital investigation platform of Gujarat Police.

## WHO YOU ARE
You assist a professional Investigating Officer (IO) on a real criminal case. You have full real-time access to the case file below. Be precise, professional, and 100% grounded in the facts provided. Never invent information not present in the case file.

## CURRENT CASE FILE

### COMPLAINT
${complaintOverview}

### PARTICIPANTS (${p?.total ?? 0} total)
${participantSummary}

### INVESTIGATION CHECKLIST
${checklistSummary}

### EVIDENCE
${evidenceSummary}

### DEPARTMENT REQUESTS
${deptSummary}

### CASE DIARY — Full Chronological History (last 30 events, oldest first)
${diaryNarrative || 'No events yet — this case is new.'}

### LEGAL CONTEXT (BNS/IPC sections retrieved for this query)
${legalContext}

---

## HOW TO RESPOND

If the officer is ASKING A QUESTION (who, what, when, where, how, explain, status):
→ Answer directly with specific facts. Reference diary timestamps, evidence IDs, participant names.

If the officer wants a STATE CHANGE (add step, draft letter, create, update, send, recommend):
→ DO NOT apply it. Output a proposal block:

\`\`\`proposal
{
  "type": "add_step",
  "payload": {
    "title": "Specific step title",
    "description": "What to do and why based on case facts",
    "criticality": "high|medium|low",
    "target": "department_entity|complainant|",
    "department_entity_id": "BANK|ISP|TELECOM (only if department_entity)"
  }
}
\`\`\`

\`\`\`proposal
{
  "type": "draft_request",
  "payload": {
    "department_entity_id": "HDFC Bank | Airtel | etc",
    "draft_content": "Formal letter text..."
  }
}
\`\`\`

Always explain your reasoning using specific facts from the case file before any proposal.
IMPORTANT: You must provide your response directly in the following language code: ${language}. Do not use English unless the language code is 'en'.`;

    const maxTokens = isComplex ? 2000 : 1200;
    logger.debug(`[Copilot] ${isComplex ? 'deepCall' : 'fastCall'} for: "${message.substring(0, 80)}"`);

    const response = isComplex
      ? await deepCall(systemPrompt, message, { maxTokens }) as string
      : await fastCall(systemPrompt, message, { maxTokens }) as string;

    return response;
  }
}
