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

export class DepartmentPortalController {
  
  /**
   * POST /api/v1/department-portal/login
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
        department_entity_id: user.department_entity_id
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
      }).sort({ updatedAt: -1 });

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
        
        // 3. Update Checklist Step with the custom evidence
        const checklistStep = await CaseChecklist.findOne({ 
          case_id: request.case_id, 
          step_id: request.step_id 
        });
        if (checklistStep) {
          checklistStep.status = 'completed';
          checklistStep.proof_evidence_ids.push(customEvidenceId);
          checklistStep.completed_at = new Date();
          await checklistStep.save();
        }
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

      // 4. Append Diary Entry
      await DiaryEntry.create({
        case_id: request.case_id,
        entry_id: uuidv4(),
        actor: { type: 'department', id: request.department_entity_id },
        event_type: 'response_received',
        payload: { 
          request_id: request.request_id, 
          evidence_id: evidence.evidence_id,
          content: response_content 
        },
        ref_ids: { 
          request_id: request.request_id,
          evidence_id: evidence.evidence_id
        }
      });

      // 5. Enqueue Analysis Job (Automatically triggers AI re-evaluation of case facts)
      InvestigationOrchestrator.runAnalysis(request.case_id.toString()).catch(err => {
        logger.error(`In-process analysis failed:`, err);
      });

      logger.info(`Response ingested successfully for request ${id}`);

      sendSuccess(res, HttpStatusCode.OK, 'Response submitted successfully', {
        request,
        evidence
      });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'RESPOND_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
