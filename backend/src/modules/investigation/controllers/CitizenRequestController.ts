import { Request, Response } from 'express';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { Complaint } from '../../complaint/models/Complaint.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { Evidence } from '../models/Evidence.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { InvestigationOrchestrator } from '../services/investigationOrchestrator';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import logger from '../../../config/logger';
import { EmailQueue } from '../../../shared/queue/EmailQueue';
import { fastCall } from '../../../shared/llm/ollamaClient';

export class CitizenRequestController {
  
  /**
   * Retrieves a request for a citizen using the secure token.
   * Public (unauthenticated).
   */
  static async getRequestByToken(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const request = await DepartmentRequest.findOne({ token }).lean();

      if (!request) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Request not found or invalid token');
      }

      if (request.token_expires_at && request.token_expires_at < new Date()) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, 'This request link has expired');
      }

      if (request.status === 'response_received') {
        return sendError(res, HttpStatusCode.BAD_REQUEST, 'A response has already been submitted for this request');
      }

      const caseDoc = await Complaint.findById(request.case_id).lean();
      if (!caseDoc) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Case not found');
      }

      sendSuccess(res, HttpStatusCode.OK, 'Request retrieved', {
        caseId: caseDoc.complaintNumber,
        content: request.draft_content,
        status: request.status,
        expiresAt: request.token_expires_at,
      });
    } catch (error: any) {
      logger.error('Error fetching citizen request by token', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error fetching request');
    }
  }

  /**
   * Submits a response (text + files) for a citizen request.
   * Public (unauthenticated).
   */
  static async submitResponse(req: any, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { message } = req.body;
      const files = req.files as any[];

      const request = await DepartmentRequest.findOne({ token });
      if (!request) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Request not found or invalid token');
      }

      if (request.token_expires_at && request.token_expires_at < new Date()) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, 'This request link has expired');
      }

      if (request.status === 'response_received') {
        return sendError(res, HttpStatusCode.BAD_REQUEST, 'A response has already been submitted for this request');
      }

      const caseDoc = await Complaint.findById(request.case_id);
      if (!caseDoc) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Case not found');
      }

      // Mock uploading files to storage. In a real app we'd upload to Cloudinary/S3.
      const evidenceIds = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const evidence = new Evidence({
            case_id: request.case_id,
            evidence_id: uuidv4(),
            type: 'document',
            storage_ref: `mock_upload_${uuidv4()}_${file.originalname}`,
            uploader_id: new Types.ObjectId(), // We don't have an officer ID here, it's public. We might need a system ID or just mock it.
            status: 'pending',
            source: 'complainant',
            origin: 'post_complaint_request',
            linked_request_id: request.request_id,
            ai_description: 'Uploaded by citizen via request link',
            ai_tags: ['citizen_upload'],
          });
          await evidence.save();
          evidenceIds.push(evidence.evidence_id);
        }
      }

      // If there's a message but no files, we can save the message as an evidence document or just log it.
      // Let's create an evidence doc for the text if provided.
      if (message) {
        const textEvidence = new Evidence({
          case_id: request.case_id,
          evidence_id: uuidv4(),
          type: 'document',
          storage_ref: `citizen_text_response_${uuidv4()}`,
          uploader_id: new Types.ObjectId(),
          status: 'pending',
          source: 'complainant',
          origin: 'post_complaint_request',
          linked_request_id: request.request_id,
          ai_description: `Citizen Text Response: ${message}`,
          ai_tags: ['citizen_message'],
        });
        await textEvidence.save();
        evidenceIds.push(textEvidence.evidence_id);
      }

      // Update the request status
      request.status = 'response_received';
      request.response_at = new Date();
      request.response_ref = evidenceIds.length > 0 ? evidenceIds[0] : undefined;
      await request.save();

      // Complete the checklist step
      const step = await CaseChecklist.findOne({ case_id: request.case_id, step_id: request.step_id });
      if (step) {
        step.status = 'completed';
        step.completed_at = new Date();
        step.proof_evidence_ids = evidenceIds;
        await step.save();
      }

      // Add Diary Entry
      await DiaryEntry.create({
        case_id: request.case_id,
        entry_id: uuidv4(),
        actor: { type: 'complainant', id: 'complainant' },
        event_type: 'evidence_collected',
        payload: { message: 'Complainant responded to request with evidence', evidenceIds },
        ref_ids: { request_id: request.request_id }
      });

      // Trigger re-analysis
      InvestigationOrchestrator.runAnalysis(request.case_id.toString()).catch((err: any) => {
        logger.error(`Re-analysis failed for case ${request.case_id}:`, err);
      });

      sendSuccess(res, HttpStatusCode.OK, 'Response submitted successfully', {});
    } catch (error: any) {
      logger.error('Error submitting citizen response', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error submitting response');
    }
  }

  /**
   * Generates a citizen request from the IO dashboard.
   * Authenticated (Officer).
   */
  static async createCitizenRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params; // caseId
      const { step_id } = req.body;

      const step = await CaseChecklist.findOne({ case_id: id, step_id });
      if (!step) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Checklist step not found');
      }

      const caseDoc = await Complaint.findById(id).lean();
      if (!caseDoc) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Case not found');
      }

      // Generate a plain-language draft using fastCall
      const systemPrompt = `You are a helpful police assistant. Draft a short, professional, plain-language message to the citizen requesting specific information based on the step description. Instruct them to log into the Citizen Portal using their credentials to provide the requested information and evidence. Keep it concise (1-2 sentences).`;
      const userPrompt = `Task: ${step.title}\nRequired Evidence: ${(step.required_evidence || []).join(', ')}`;
      
      let draftContent = 'Please log into the Citizen Portal to provide the requested information to help us proceed with your case.';
      try {
        draftContent = await fastCall(systemPrompt, userPrompt) as string;
      } catch (err) {
        logger.error('LLM draft failed for citizen request, using fallback', err);
      }

      const request = new DepartmentRequest({
        case_id: id,
        request_id: uuidv4(),
        step_id: step.step_id,
        request_type: 'external_department',
        recipient_type: 'citizen',
        draft_content: draftContent,
        status: 'sent', // we send it immediately
        sent_via: 'email',
        sent_at: new Date(),
      });

      await request.save();

      // Update step status to blocked
      step.status = 'blocked';
      step.locked_by_request_id = request.request_id;
      await step.save();

      // Enqueue email
      const payload = {
        to: 'citizen@example.com',
        name: 'Complainant',
        caseId: caseDoc.complaintNumber,
        content: draftContent,
      };
      
      await EmailQueue.enqueueCitizenRequest(payload);

      // Add Diary Entry
      await DiaryEntry.create({
        case_id: id,
        entry_id: uuidv4(),
        actor: { type: 'system', id: 'orchestrator' },
        event_type: 'request_sent',
        payload: { recipient: 'Complainant', message: 'Requested evidence from citizen', content: draftContent },
        ref_ids: { request_id: request.request_id }
      });

      sendSuccess(res, HttpStatusCode.OK, 'Citizen request sent successfully', { request });
    } catch (error: any) {
      logger.error('Error creating citizen request', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, 'Error creating citizen request');
    }
  }
}
