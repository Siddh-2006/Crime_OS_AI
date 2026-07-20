import { buildFactsObject } from './factsAssemblyService';
import { callLegalAgent } from '../../../shared/clients/legalAgentClient';
import { fastCall, deepCall } from '../../../shared/llm/ollamaClient';
import { DiaryEntry } from '../models/DiaryEntry.model';
import logger from '../../../config/logger';

export class CopilotService {
  /**
   * Ask the copilot a question.
   * If the question implies a state change, it returns a proposal block.
   */
  static async ask(caseId: string, message: string): Promise<string> {
    logger.info(`[Copilot] Received question for caseId: ${caseId}`);
    
    // 1. Gather Case Context
    const facts = await buildFactsObject(caseId);
    
    // Also fetch the last 10 diary entries to give recent conversational context
    const recentDiary = await DiaryEntry.find({ case_id: caseId })
      .sort({ timestamp: -1 })
      .limit(10);
      
    const diaryText = recentDiary.map(d => `[${d.timestamp.toISOString()}] ${d.event_type}`).join('\n');

    // 2. Decide Complexity 
    // Heuristic: If it contains words like 'add', 'propose', 'draft', 'create', 'update', 'change', we use deepCall.
    // Otherwise we use fastCall.
    const isComplex = /add|propose|draft|create|update|change|recommend/i.test(message);

    // 3. Query RAG (Legal Agent)
    const queryStr = `Context: ${message}. Facts: ${JSON.stringify(facts.checklist?.summary ?? {})}`;
    let legalContext = '';
    try {
      const legalResult = await callLegalAgent(queryStr);
      legalContext = JSON.stringify(legalResult);
    } catch(err) {
      logger.warn(`[Copilot] Legal Agent query failed. Proceeding without it.`);
    }

    const systemPrompt = `You are a highly capable AI Copilot assisting an Investigating Officer with a criminal case.
You have access to the following case facts:
${JSON.stringify(facts, null, 2)}

Recent Case Diary (Event History):
${diaryText}

Legal Context:
${legalContext}

CRITICAL INSTRUCTIONS:
If the officer is just asking a question, answer it directly and concisely.
If the officer is asking you to make a STATE CHANGE (e.g. adding a new investigation step, drafting a letter, changing priority), do NOT apply it yourself or pretend to apply it.
Instead, you MUST output a JSON proposal block that the system will render as a button for the officer to approve.

Format for a proposal:
\`\`\`proposal
{
  "type": "add_step",
  "payload": {
    "title": "Your proposed title",
    "description": "Your proposed description",
    "criticality": "high|medium|low"
  }
}
\`\`\`

You can also propose drafts:
\`\`\`proposal
{
  "type": "draft_request",
  "payload": {
    "department_entity_id": "e.g. HDFC Bank",
    "draft_content": "Dear Nodal Officer, please provide..."
  }
}
\`\`\`

Always explain your reasoning before outputting the proposal block.`;

    if (isComplex) {
      logger.debug(`[Copilot] Routing to deepCall for message: ${message}`);
      // Return as text, NOT jsonMode, because we want Markdown + the proposal block embedded
      const response = await deepCall(systemPrompt, message, { maxTokens: 2000 }) as string;
      return response;
    } else {
      logger.debug(`[Copilot] Routing to fastCall for message: ${message}`);
      const response = await fastCall(systemPrompt, message, { maxTokens: 1500 }) as string;
      return response;
    }
  }
}
