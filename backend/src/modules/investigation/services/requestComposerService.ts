import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import { buildFactsObject } from './factsAssemblyService';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { Complaint } from '../../complaint/models/Complaint.model';
import { DepartmentRegistry } from '../../admin/models/DepartmentRegistry.model';
import { fastCall } from '../../../shared/llm/ollamaClient';
import { EmailQueue } from '../../../shared/queue/EmailQueue';
import logger from '../../../config/logger';

export class RequestComposerService {
  /**
   * Generates a draft letter using the AI and saves it to the database.
   */
  static async generateDraftRequest(
    caseId: string,
    stepId: string,
    departmentEntityId: string,
    requestType: 'external_department' | 'inter_station_assignment' = 'external_department',
    recipientType: string = 'External Department'
  ) {
    logger.info(`Generating draft request for case ${caseId}, step ${stepId}`);
    
    const factsObject = await buildFactsObject(caseId);
    
    // Look up the specific step to understand the context
    const checklistStep = await CaseChecklist.findOne({ case_id: caseId, step_id: stepId });
    if (!checklistStep) {
      throw new Error(`Checklist step ${stepId} not found for case ${caseId}`);
    }

    // Look up Complaint and IO details
    const complaint = await Complaint.findById(caseId).populate('assignedIO policeStation');
    let ioDetails = '[Name/Designation of Requesting Officer]\\n[Police Station/Unit Details]';
    if (complaint && complaint.assignedIO && complaint.policeStation) {
      const io = complaint.assignedIO as any;
      const station = complaint.policeStation as any;
      ioDetails = `${io.rank || 'Investigating Officer'} ${io.name || io.first_name || ''}\n${station.name || 'Cyber Crime Police Station'}\n${station.district || ''}, ${station.state || ''}`;
    }

    // Look up exact department name
    let targetDeptName = departmentEntityId;
    if (departmentEntityId && departmentEntityId !== 'UNKNOWN_DEPARTMENT') {
      const deptRecord = await DepartmentRegistry.findOne({ entity_id: departmentEntityId });
      if (deptRecord) targetDeptName = deptRecord.entity_name;
    }

    const systemPrompt = `You are an AI assistant helping a police officer draft an official inter-departmental request letter.
You must output ONLY a valid JSON object with the following structure:
{
  "draft_content": "The professional letter content...",
  "suggested_evidence_ids": ["uuid-1", "uuid-2"]
}
Keep the letter formal, concise, and highly specific. You MUST include specific details from the Case Facts (e.g., Account Numbers, UPI IDs, Phone Numbers, Transaction IDs) that the receiving department will need to process the request. Do not just put the Case ID.

Formatting rules for "draft_content":
1. Address the letter "To,\\n${targetDeptName}".
2. Write a highly specific "Subject:" line that clearly states the exact action and target (e.g., "Subject: Request for freezing HDFC Bank Account XXXXXX in Cyber Fraud FIR"). Do not use generic subjects.
3. Determine a reasonable timeframe for the response (e.g. "within 7 days") instead of leaving bracketed placeholders.
4. End the letter EXACTLY with the following sign-off:
Sincerely,
${ioDetails}

Do NOT use any bracketed placeholders in the final letter.`;

    const userPrompt = `
Task: Draft a request to ${targetDeptName} (Type: ${recipientType}) to satisfy the following SOP step:
Title: ${checklistStep.title}
Required Evidence: ${checklistStep.required_evidence.join(', ')}

Case Facts to reference:
${JSON.stringify(factsObject, null, 2)}

Instructions for the Draft:
1. If this is a bank KYC or fund hold request, explicitly state the Account Number or UPI ID in the letter.
2. If this is a telecom CDR request, explicitly state the Phone Number.
3. If this is a crypto trace, state the wallet address or transaction hash.
4. Ensure the letter clearly states WHAT information or action is being requested from the department.

Only include evidence_ids in suggested_evidence_ids if they are explicitly mentioned in the Case Facts and are highly relevant as attachments to this request.
Return JSON.`;

    logger.debug('Calling LLM to compose draft letter...');
    let aiResult: any = {};
    try {
      aiResult = await fastCall(systemPrompt, userPrompt, { jsonMode: true, maxTokens: 1500 }) as any;
    } catch (err) {
      logger.warn('LLM failed to generate draft, using fallback', { error: err });
      aiResult = {
        draft_content: `Fallback draft: Request for ${checklistStep.title}`,
        suggested_evidence_ids: []
      };
    }
    
    const draftContent = aiResult.draft_content || 'Unable to generate draft content.';
    const suggestedEvidence = Array.isArray(aiResult.suggested_evidence_ids) ? aiResult.suggested_evidence_ids : [];

    const newRequest = new DepartmentRequest({
      case_id: new Types.ObjectId(caseId),
      request_id: uuidv4(),
      step_id: stepId,
      request_type: requestType,
      recipient_type: recipientType,
      department_entity_id: departmentEntityId,
      draft_content: draftContent,
      attachments: suggestedEvidence,
      status: 'draft'
    });

    await newRequest.save();
    logger.info(`Draft request ${newRequest.request_id} created successfully.`);
    return newRequest;
  }

  /**
   * Sends the request: locks checklist, updates DB, queues email, logs diary.
   */
  static async sendRequest(caseId: string, requestId: string) {
    logger.info(`Sending request ${requestId} for case ${caseId}`);
    
    const request = await DepartmentRequest.findOne({ case_id: caseId, request_id: requestId });
    if (!request) {
      throw new Error(`Request ${requestId} not found.`);
    }

    if (request.status !== 'draft' && request.status !== 'reviewed') {
      throw new Error(`Request ${requestId} is already in status: ${request.status}`);
    }

    // 1. Update Request status
    request.status = 'sent';
    request.sent_via = 'email';
    request.sent_at = new Date();
    await request.save();

    // 1b. Create the RequestThread with message[0]
    const { RequestThread } = require('../models/RequestThread.model');
    const stepTitle = (await CaseChecklist.findOne({ case_id: caseId, step_id: request.step_id }))?.title || request.step_id;
    await RequestThread.create({
      case_id: request.case_id,
      request_id: request.request_id,
      department_entity_id: request.department_entity_id,
      step_title: stepTitle,
      unread_by_io: false,
      messages: [{
        sender: 'io',
        content: request.draft_content,
        timestamp: new Date(),
        attachments: request.attachments || []
      }]
    });

    // 2. Lock the Checklist Step
    const checklistStep = await CaseChecklist.findOne({ case_id: caseId, step_id: request.step_id });
    if (checklistStep) {
      checklistStep.status = 'in_progress';
      checklistStep.locked_by_request_id = request.request_id;
      await checklistStep.save();
    }

    // 3. Append Diary Entry
    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'system' },
      event_type: 'request_sent',
      payload: { 
        request_id: request.request_id, 
        department_entity_id: request.department_entity_id,
        content: request.draft_content
      },
      ref_ids: { request_id: request.request_id }
    });

    // 4. Enqueue Email Job via existing EmailQueue → Nodemailer worker
    // Looks up the department's contact email from DepartmentRegistry.
    // Falls back to a log warning if no email is found rather than crashing.
    try {
      const registry = await DepartmentRegistry.findOne({ entity_id: request.department_entity_id }).lean();
      const deptEmail: string | undefined =
        (registry as any)?.contact_email ?? undefined;

      if (deptEmail) {
        await EmailQueue.enqueueDepartmentRequest({
          to:             deptEmail,
          departmentName: request.department_entity_id ?? 'External Department',
          caseId:         caseId.toString(),
          requestId:      request.request_id,
          content:        request.draft_content,
        });
        logger.info(`Department request email queued to ${deptEmail} for request ${requestId}`);
      } else {
        logger.warn(
          `No contact_email found in DepartmentRegistry for "${request.department_entity_id}". ` +
          `Email not sent for request ${requestId}. Add a contact_email field to the registry entry.`,
        );
      }
    } catch (err: any) {
      logger.warn(`Failed to enqueue department request email for request ${requestId}`, { error: err.message });
    }

    logger.info(`Request ${requestId} dispatched successfully.`);
    return request;
  }
}
