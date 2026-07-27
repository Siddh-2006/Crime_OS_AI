import { Request, Response } from 'express';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { RequestThread } from '../models/RequestThread.model';
import { Complaint } from '../../complaint/models/Complaint.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { Evidence } from '../models/Evidence.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import mongoose, { Types } from 'mongoose';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { v4 as uuidv4 } from 'uuid';
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
      let request: any = await DepartmentRequest.findOne({ token }).lean();

      if (!request) {
        // Fallback: Check MongoDB upload_tokens collection created during complaint registration / token generation
        const db = mongoose.connection.db;
        if (db) {
          const uploadToken = await db.collection('upload_tokens').findOne({
            $or: [{ token }, { _id: token }]
          } as any);

          if (uploadToken && !uploadToken.is_revoked) {
            return sendSuccess(res, HttpStatusCode.OK, 'Request retrieved', {
              caseId: uploadToken.complaint_number || uploadToken.case_id,
              content: 'Please upload any supporting photographs, videos, audio recordings, or documents for your complaint.',
              status: 'pending',
              expiresAt: uploadToken.expires_at || null,
            });
          }
        }

        return sendError(res, HttpStatusCode.NOT_FOUND, 'Request not found or invalid token');
      }

      if (request.token_expires_at && request.token_expires_at < new Date()) {
        return sendError(res, HttpStatusCode.BAD_REQUEST, 'This request link has expired');
      }

      if (request.status === 'response_received') {
        return sendError(res, HttpStatusCode.BAD_REQUEST, 'A response has already been submitted for this request');
      }

      const caseDoc = await Complaint.findById(request.case_id).lean();
      sendSuccess(res, HttpStatusCode.OK, 'Request retrieved', {
        caseId: caseDoc ? caseDoc.complaintNumber : (request.case_id || 'Case Evidence Request'),
        content: request.draft_content || 'Please upload evidence requested by the Investigation Officer.',
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

      let request: any = await DepartmentRequest.findOne({ token });
      let caseId: any = request ? request.case_id : null;

      if (!request) {
        const db = mongoose.connection.db;
        if (db) {
          const uploadToken = await db.collection('upload_tokens').findOne({
            $or: [{ token }, { _id: token }]
          } as any);

          if (uploadToken && !uploadToken.is_revoked) {
            caseId = uploadToken.case_id;
          }
        }
      }

      if (!request && !caseId) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Request not found or invalid token');
      }

      // Resolve valid Mongoose ObjectId for Complaint model
      let complaintDoc = await Complaint.findOne({
        $or: [
          ...(Types.ObjectId.isValid(caseId) ? [{ _id: new Types.ObjectId(caseId) }] : []),
          { complaintNumber: caseId },
          { case_id: caseId }
        ]
      } as any);

      let mongoCaseObjectId: Types.ObjectId;
      if (complaintDoc && complaintDoc._id) {
        mongoCaseObjectId = complaintDoc._id as Types.ObjectId;
      } else if (Types.ObjectId.isValid(caseId)) {
        mongoCaseObjectId = new Types.ObjectId(caseId);
      } else {
        // Create or retrieve placeholder Complaint doc for custom string case IDs
        const newComplaint = new Complaint({
          complaintNumber: caseId,
          title: `Case ${caseId}`,
          description: `Case initialized via secure evidence portal (${caseId})`,
          category: 'CYBERCRIME',
          status: 'REGISTERED',
          citizenId: new Types.ObjectId(),
        });
        await newComplaint.save();
        mongoCaseObjectId = newComplaint._id as Types.ObjectId;
      }

      const evidenceIds: string[] = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const evidence = new Evidence({
            case_id: mongoCaseObjectId,
            evidence_id: uuidv4(),
            type: file.mimetype?.startsWith('image/') ? 'image' : file.mimetype?.startsWith('audio/') ? 'audio' : file.mimetype?.startsWith('video/') ? 'video' : 'document',
            storage_ref: `evidence_${uuidv4()}_${file.originalname}`,
            uploader_id: new Types.ObjectId(),
            status: 'pending',
            source: 'complainant',
            origin: 'post_complaint_request',
            ai_description: `Uploaded by citizen via secure evidence link (${file.originalname})`,
            ai_tags: ['citizen_upload'],
          });
          await evidence.save();
          evidenceIds.push(evidence.evidence_id);
        }
      }

      if (message) {
        const textEvidence = new Evidence({
          case_id: mongoCaseObjectId,
          evidence_id: uuidv4(),
          type: 'document',
          storage_ref: `citizen_text_response_${uuidv4()}`,
          uploader_id: new Types.ObjectId(),
          status: 'pending',
          source: 'complainant',
          origin: 'post_complaint_request',
          ai_description: `Citizen Text Response: ${message}`,
          ai_tags: ['citizen_message'],
        });
        await textEvidence.save();
        evidenceIds.push(textEvidence.evidence_id);
      }

      if (request) {
        request.status = 'response_received';
        request.response_at = new Date();
        request.response_ref = evidenceIds.length > 0 ? evidenceIds[0] : undefined;
        await request.save();
      }

      // ── High-Visibility Node.js Terminal Progress Logging ────────────────────
      const uploadedFileNames = files ? files.map(f => f.originalname).join(', ') : 'None';
      console.log(`\n======================================================================`);
      console.log(` 📥 NEW EVIDENCE RECEIVED IN NODE.JS GATEWAY`);
      console.log(`    Case Reference ID : ${caseId}`);
      console.log(`    Files Uploaded    : ${files ? files.length : 0} file(s) [${uploadedFileNames}]`);
      console.log(`    Complainant Msg   : ${message || 'N/A'}`);
      console.log(`    Evidence IDs      : ${evidenceIds.join(', ')}`);
      console.log(`    MongoDB Atlas     : Raw evidence stored in 'evidences' collection`);
      console.log(`    Dispatching       : Forwarding to Python AI Engine (http://localhost:8001)...`);
      console.log(`======================================================================\n`);

      logger.info(`[EVIDENCE UPLOAD] Case '${caseId}': Saved ${evidenceIds.length} evidence record(s). Retriggering AI pipeline...`);

      // ── Forward files asynchronously to Python AI Incremental Pipeline ───────
      if (files && files.length > 0) {
        try {
          const FormData = require('form-data');
          const axios = require('axios');
          const env = require('../../../config/env').default;
          
          const formData = new FormData();
          for (const file of files) {
            formData.append('files', file.buffer, {
              filename: file.originalname,
              contentType: file.mimetype,
            });
          }

          axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload/${token}`, formData, {
            headers: formData.getHeaders(),
            timeout: 15000,
          }).then((pyRes: any) => {
            console.log(`  ✓ [PIPELINE TRIGGERED] Python AI Engine accepted job (HTTP ${pyRes.status}).`);
            console.log(`     -> Cloudinary upload, Florence-2 Vision & LLM Fusion running in background!`);
            console.log(`     -> Check Python uvicorn terminal for Florence-2 & LLM stage logs.\n`);
            logger.info(`[PIPELINE SUCCESS] Python Incremental Intelligence Pipeline triggered for Case '${caseId}': HTTP ${pyRes.status}`);
          }).catch((pyErr: any) => {
            console.log(`  ⚠️ [PIPELINE WARNING] Python AI Engine notification notice for Case '${caseId}': ${pyErr.message}\n`);
            logger.warn(`[PIPELINE NOTICE] Python Intelligence service notice for Case '${caseId}': ${pyErr.message}`);
          });
        } catch (err: any) {
          logger.warn(`[PIPELINE NOTICE] Could not forward multipart files to Python service: ${err.message}`);
        }
      }

      sendSuccess(res, HttpStatusCode.OK, 'Response submitted successfully', {
        evidenceIds,
        pipelineTriggered: true,
      });
    } catch (error: any) {
      logger.error('Error submitting citizen response by token', error);
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

      const caseDoc = await Complaint.findById(id)
        .populate('citizen', 'firstName lastName email')
        .lean();
      if (!caseDoc) {
        return sendError(res, HttpStatusCode.NOT_FOUND, 'Case not found');
      }

      const citizen = (caseDoc as any).citizen as any;
      const citizenEmail = citizen?.email ?? 'citizen@example.com';
      const citizenName = [citizen?.firstName, citizen?.lastName].filter(Boolean).join(' ') || 'Complainant';
      if (!citizen?.email) {
        logger.warn(`Citizen email missing for case ${id}; falling back to placeholder address`);
      }

      // Generate a plain-language draft using fastCall
      const systemPrompt = `You are a helpful police assistant. Draft a short, professional, plain-language message to the citizen requesting specific information based on the step description. Instruct them to reply to this email with the requested information and include the Complaint ID in the reply. Keep it concise (1-2 sentences).`;
      const userPrompt = `Task: ${step.title}\nRequired Evidence: ${(step.required_evidence || []).join(', ')}`;
      
      let draftContent = 'Please reply to this email with the requested information so we can proceed with your case.';
      try {
        draftContent = await fastCall(systemPrompt, userPrompt) as string;
      } catch (err) {
        logger.error('LLM draft failed for citizen request, using fallback', err);
      }

      const request = new DepartmentRequest({
        case_id: id,
        request_id: uuidv4(),
        step_id: step.step_id,
        request_type: 'citizen_request',
        recipient_type: 'citizen',
        draft_content: draftContent,
        status: 'sent', // we send it immediately
        sent_via: 'email',
        sent_at: new Date(),
      });

      await request.save();

      await RequestThread.create({
        case_id: request.case_id,
        request_id: request.request_id,
        department_entity_id: citizenName,
        step_title: step.title,
        request_type: request.request_type,
        recipient_type: request.recipient_type,
        unread_by_io: false,
        messages: [
          {
            sender: 'io',
            content: request.draft_content,
            timestamp: new Date(),
            attachments: []
          }
        ]
      });

      // Update step status to blocked
      step.status = 'blocked';
      step.locked_by_request_id = request.request_id;
      await step.save();

      // Enqueue email to the actual complainant inbox
      const payload = {
        to: citizenEmail,
        name: citizenName,
        caseId: caseDoc._id.toString(),
        requestId: request.request_id,
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
