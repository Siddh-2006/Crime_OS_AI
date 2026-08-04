import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { DepartmentRequest } from '../../investigation/models/DepartmentRequest.model';
import { RequestThread } from '../../investigation/models/RequestThread.model';
import { CaseChecklist } from '../../investigation/models/CaseChecklist.model';
import { Evidence } from '../../investigation/models/Evidence.model';
import { DiaryEntry } from '../../investigation/models/DiaryEntry.model';
import { InvestigationOrchestrator } from '../../investigation/services/investigationOrchestrator';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import logger from '../../../config/logger';
import { User } from '../../user/models/User.model';
import cloudinary from '../../../config/cloudinary';
export class DepartmentPortalController {

  /**
   * POST /api/v1/department-portal/upload-signature
   * Get cloudinary signature for department uploads
   */
  static async getUploadSignature(_req: Request, res: Response): Promise<void> {
    try {
      const timestamp = Math.round(new Date().getTime() / 1000);
      const publicId = `dept_evidence_${uuidv4()}`;
      const folder = `crime-os/department_responses`;

      const signature = cloudinary.utils.api_sign_request(
        {
          timestamp,
          folder,
          public_id: publicId,
        },
        cloudinary.config().api_secret!
      );

      sendSuccess(res, HttpStatusCode.OK, 'Upload signature generated successfully', {
        signature,
        timestamp,
        apiKey: cloudinary.config().api_key,
        cloudName: cloudinary.config().cloud_name,
        folder,
        publicId,
      });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SIGNATURE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Real auth using User model seeded by seed-department-users.js
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body;
      
      const user = await User.findOne({ username, role: 'department' }).select('+password');
      if (!user) {
        sendError(res, HttpStatusCode.UNAUTHORIZED, {
          code: 'AUTH_FAILED',
          message: 'Invalid credentials or not a department user'
        });
        return;
      }

      if (!user.password) {
        sendError(res, HttpStatusCode.UNAUTHORIZED, {
          code: 'AUTH_FAILED',
          message: 'Invalid credentials'
        });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        sendError(res, HttpStatusCode.UNAUTHORIZED, {
          code: 'AUTH_FAILED',
          message: 'Invalid credentials'
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Login successful', {
        token: `mock-token-${user.username}`, // For frontend localStorage
        department_entity_id: (user as any).department_entity_id  // field removed from model — portal disabled
      });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'LOGIN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/department-portal/inbox
   * Fetch all RequestThread documents for the logged-in department
   */
  static async getInbox(req: Request, res: Response): Promise<void> {
    try {
      const { department_entity_id } = req.query;

      if (!department_entity_id) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'MISSING_PARAM',
          message: 'department_entity_id query param required'
        });
        return;
      }

      const threads = await RequestThread.find({
        department_entity_id,
      }).sort({ updatedAt: -1 }).lean();

      // Fetch all evidence for these threads
      const allEvidenceIds = threads.flatMap(t => t.messages.flatMap(m => m.attachments || []));
      const evidences = await Evidence.find({ evidence_id: { $in: allEvidenceIds } }).lean();
      
      const evMap: Record<string, any> = {};
      evidences.forEach(e => {
        evMap[e.evidence_id] = e;
      });

      // Map back Evidence objects into the attachments array
      threads.forEach(t => {
        t.messages.forEach(m => {
          if (m.attachments && m.attachments.length > 0) {
            // @ts-ignore - replacing string array with object array for frontend
            m.attachments = m.attachments.map(id => evMap[id] || { evidence_id: id, type: 'unknown' });
          }
        });
      });

      sendSuccess(res, HttpStatusCode.OK, 'Inbox fetched', threads);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }


  /**
   * POST /api/v1/department-portal/requests/:id/respond
   * Submit mock response, complete the checklist, and ingest evidence.
   */
  static async respondToRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { response_content, evidence } = req.body; // evidence is optional { type, title, description, tags, storage_ref }

      if (!response_content) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'MISSING_PARAM',
          message: 'response_content is required'
        });
        return;
      }

      const request = await DepartmentRequest.findOne({ request_id: id });
      if (!request) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'Request not found'
        });
        return;
      }

      if (request.status !== 'sent') {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_STATUS',
          message: `Cannot respond to request in status: ${request.status}`
        });
        return;
      }

      // 1. Update Request
      request.status = 'response_received';
      request.response_ref = response_content;
      request.response_at = new Date();
      await request.save();

      // 1b. Update RequestThread
      const { RequestThread } = require('../../investigation/models/RequestThread.model');
      const thread = await RequestThread.findOne({ request_id: request.request_id });
      let threadAttachments: string[] = [];

      // 2. Auto-label Default Evidence (the response text itself as a document)
      const defaultEvidenceId = uuidv4();
      threadAttachments.push(defaultEvidenceId);
      await Evidence.create({
        case_id: request.case_id,
        evidence_id: defaultEvidenceId,
        type: 'document',
        storage_ref: 'mock-storage-ref', // A real app would upload the PDF and store the URL here
        ai_description: 'Auto-ingested response via department portal.',
        ai_tags: ['department_response'],
        uploader_id: request.case_id, // Mock uploader using case_id for ease of seeding (system actor)
        status: 'verified',
        source: 'department',
        linked_request_id: request.request_id
      });

      // 2b. Add explicit evidence if provided by the department
      if (evidence) {
        const customEvidenceId = `EV-DEPT-${Date.now()}`;
        threadAttachments.push(customEvidenceId);
        await Evidence.create({
          case_id: request.case_id,
          evidence_id: customEvidenceId,
          type: evidence.type || 'document',
          storage_ref: evidence.storage_ref || `mock-storage-${Date.now()}`,
          ai_description: evidence.description || 'Department provided additional evidence',
          ai_tags: evidence.tags || [],
          uploader_id: request.case_id, // Mock
          status: 'verified',
          source: 'department',
          title: evidence.title,
          linked_request_id: request.request_id
        });
      }

      // Handle file uploads array from frontend FileUpload component
      const { attachments } = req.body; // Expects array of { publicId, secureUrl, originalFilename, resourceType, size }
      if (attachments && Array.isArray(attachments)) {
        for (const att of attachments) {
          const customEvidenceId = `EV-DEPT-${Date.now()}-${Math.floor(Math.random()*1000)}`;
          threadAttachments.push(customEvidenceId);
          await Evidence.create({
            case_id: request.case_id,
            evidence_id: customEvidenceId,
            type: att.resourceType === 'image' ? 'image' : (att.resourceType === 'video' ? 'video' : 'document'),
            storage_ref: att.secureUrl, // directly store URL
            cloudinary_url: att.secureUrl,
            original_filename: att.originalFilename,
            ai_description: `Department uploaded file: ${att.originalFilename}`,
            ai_tags: ['department_upload'],
            uploader_id: request.case_id,
            status: 'verified',
            source: 'department',
            linked_request_id: request.request_id
          });
        }
      }

      // 3. Update Checklist Step with the custom evidence
      const checklistStep = await CaseChecklist.findOne({ 
        case_id: request.case_id, 
        step_id: request.step_id 
      });
      if (checklistStep) {
        checklistStep.status = 'completed';
        checklistStep.proof_evidence_ids.push(...threadAttachments);
        checklistStep.completed_at = new Date();
        await checklistStep.save();
      }

      // Append to Thread
      if (thread) {
        thread.messages.push({
          sender: 'department',
          content: response_content,
          timestamp: new Date(),
          attachments: threadAttachments
        });
        thread.unread_by_io = true;
        await thread.save();
      }

      // 4. Append DiaryEntry
      await DiaryEntry.create({
        case_id: request.case_id,
        entry_id: uuidv4(),
        actor: { type: 'department', id: request.department_entity_id },
        event_type: 'response_received',
        payload: { 
          request_id: request.request_id, 
          evidence_ids: threadAttachments,
          content: response_content 
        },
        ref_ids: { 
          request_id: request.request_id
        }
      });

      // 5. Enqueue Analysis Job (Automatically triggers AI re-evaluation of case facts)
      InvestigationOrchestrator.runAnalysis(request.case_id.toString()).catch(err => {
        logger.error(`In-process analysis failed:`, err);
      });

      logger.info(`Response ingested successfully for request ${id}`);

      sendSuccess(res, HttpStatusCode.OK, 'Response submitted and evidence ingested', {
        request_id: request.request_id,
        status: request.status
      });
    } catch (error: any) {
      console.error('Error submitting response:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SUBMIT_FAILED',
        message: error.message || 'Error submitting response'
      });
    }
  }

  /**
   * POST /api/v1/department-portal/requests/:id/format-response
   */
  static async formatResponse(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { response_content } = req.body;

      if (!response_content) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'response_content is required' });
        return;
      }

      const request = await DepartmentRequest.findOne({ request_id: id }).lean();
      if (!request) {
        sendError(res, HttpStatusCode.NOT_FOUND, { code: 'NOT_FOUND', message: 'Request not found' });
        return;
      }

      const systemPrompt = `You are a professional assistant helping a government department rewrite a rough, casual response into a highly formal, official response to a police Investigating Officer. Ensure the tone is objective, professional, and clear. Do not add any hallucinated information; only rephrase the provided content.`;
      
      const userPrompt = `Context (What the Police asked): ${request.draft_content}\n\nRough Response from Department:\n${response_content}\n\nPlease rewrite this into a formal response.`;

      let formattedResponse = response_content; // Fallback
      try {
        const { fastCall } = await import('../../../shared/llm/ollamaClient');
        formattedResponse = await fastCall(systemPrompt, userPrompt) as string;
      } catch (err) {
        console.error('LLM format failed, using fallback', err);
      }

      sendSuccess(res, HttpStatusCode.OK, 'Response formatted', { formattedContent: formattedResponse });
    } catch (error: any) {
      console.error('Format Response Error:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'FORMAT_FAILED',
        message: error.message || 'Failed to format response'
      });
    }
  }
}
