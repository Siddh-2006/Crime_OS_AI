import { Request, Response } from 'express';
import { AnalysisQueue } from '../../../shared/queue/AnalysisQueue';
import { subscribeProgress, publishProgress } from '../../../shared/utils/analysisProgress';
import { getRedisClient } from '../../../config/redis';
import { RequestComposerService } from '../services/requestComposerService';
import { InvestigationOrchestrator } from '../services/investigationOrchestrator';
import { CopilotService } from '../services/copilotService';
import { AnalysisSnapshot } from '../models/AnalysisSnapshot.model';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { Evidence } from '../models/Evidence.model';
import { Complaint } from '../../complaint/models/Complaint.model';
import { RequestThread } from '../models/RequestThread.model';
import { buildFactsObject } from '../services/factsAssemblyService';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '../../../config/cloudinary';
import logger from '../../../config/logger';

export class InvestigationController {
  
  /**
   * POST /cases/:id/copilot/ask
   * Ask the AI copilot a question. Returns a markdown/json proposal block.
   */
  static async askCopilot(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message, language } = req.body;
      
      if (!message) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'MISSING_PARAM',
          message: 'message is required'
        });
        return;
      }

      const response = await CopilotService.ask(id, message, language);
      sendSuccess(res, HttpStatusCode.OK, 'Copilot response generated', { response });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'COPILOT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  /**
   * POST /cases/:id/analyze
   * Enqueues the case for AI analysis and returns immediately (202 Accepted).
   */
  static async analyzeCase(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { language } = req.body;

      // Publish 'queued' to Redis immediately so state-recovery and SSE work before
      // the BullMQ worker even picks up the job.
      await publishProgress(id, 'queued');

      // Enqueue via BullMQ — the worker runs runAnalysis() in the background.
      // lockDuration on the worker is set to 25 min so the lock survives long LLM calls.
      await AnalysisQueue.enqueueAnalyzeCase(id, language);

      sendSuccess(res, HttpStatusCode.OK, 'Analysis job enqueued. Connect to /analysis/progress for live updates.');
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'ANALYSIS_ENQUEUE_FAILED',
        message: 'Failed to enqueue analysis job',
      });
    }
  }

  /**
   * GET /cases/:id/analysis/status
   * State-recovery endpoint — returns current progress stage stored in Redis
   * (or 'done' if a snapshot already exists, 'idle' if nothing is running).
   * Called by the frontend on page load BEFORE opening the SSE connection.
   */
  static async getAnalysisStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const redis = getRedisClient();

      // Check if there's a stored latest-stage key
      const stageJson = await redis.get(`analysis:status:${id}`);
      if (stageJson) {
        sendSuccess(res, HttpStatusCode.OK, 'Analysis status', JSON.parse(stageJson));
        return;
      }

      // If no in-progress marker, check whether a snapshot exists
      const snapshot = await AnalysisSnapshot.findOne({ case_id: id })
        .sort({ timestamp: -1 })
        .select('snapshot_id timestamp')
        .lean();

      if (snapshot) {
        sendSuccess(res, HttpStatusCode.OK, 'Analysis status', {
          stage: 'done', label: 'Analysis complete — results are ready', pct: 100, done: true,
        });
      } else {
        sendSuccess(res, HttpStatusCode.OK, 'Analysis status', {
          stage: 'idle', label: 'No analysis has been run yet', pct: 0,
        });
      }
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'STATUS_FETCH_FAILED',
        message: 'Failed to fetch analysis status',
      });
    }
  }

  /**
   * GET /cases/:id/analysis/progress  (SSE endpoint)
   * Streams real-time progress events published by the BullMQ worker via Redis pub/sub.
   * The browser opens this as an EventSource after fetching /analysis/status.
   * The connection auto-closes when the worker publishes the 'done' or 'error' event.
   */
  static async streamAnalysisProgress(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    // SSE headers
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // flush for proxies that buffer
      if (typeof (res as any).flush === 'function') (res as any).flush();
    };

    // Send a keepalive comment every 20s so the connection doesn't time out
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), 20_000);

    const unsubscribe = subscribeProgress(id, (stage) => {
      send(stage);
      if (stage.done || stage.error) {
        clearInterval(keepalive);
        unsubscribe();
        res.end();
      }
    });

    // Clean up if the client disconnects
    req.on('close', () => {
      clearInterval(keepalive);
      unsubscribe();
    });
  }

  /**
   * GET /cases/:id/analysis/latest
   * Returns the most recent AnalysisSnapshot for the UI to display.
   */
  static async getLatestSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      const snapshot = await AnalysisSnapshot.findOne({ case_id: id })
        .sort({ timestamp: -1 })
        .lean();

      if (!snapshot) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'No analysis snapshot found for this case.'
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Fetched latest snapshot', snapshot);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SNAPSHOT_FETCH_FAILED',
        message: 'Failed to fetch latest analysis snapshot'
      });
    }
  }

  /**
   * GET /cases/:id/analysis/:snapshotId
   * Returns a specific AnalysisSnapshot for modal/detail views.
   */
  static async getSnapshotById(req: Request, res: Response): Promise<void> {
    try {
      const { id, snapshotId } = req.params;

      const snapshot = await AnalysisSnapshot.findOne({ case_id: id, snapshot_id: snapshotId }).lean();

      if (!snapshot) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'Analysis snapshot not found for this case.',
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Fetched analysis snapshot', snapshot);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SNAPSHOT_FETCH_FAILED',
        message: 'Failed to fetch analysis snapshot',
      });
    }
  }

  /**
   * Generates a new DepartmentRequest draft using the AI Composer.
   */
  static async generateDraftRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { step_id, department_entity_id, request_type, recipient_type } = req.body;

      if (!step_id || !department_entity_id) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'step_id and department_entity_id are required'
        });
        return;
      }

      const draft = await RequestComposerService.generateDraftRequest(
        id, 
        step_id, 
        department_entity_id,
        request_type,
        recipient_type
      );
      
      sendSuccess(res, HttpStatusCode.CREATED, 'Draft created', draft);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'DRAFT_GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Updates an existing draft's content.
   */
  static async updateRequestDraft(req: Request, res: Response): Promise<void> {
    try {
      const { reqId } = req.params;
      const { draft_content } = req.body;

      if (!draft_content) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'draft_content is required'
        });
        return;
      }

      const request = await DepartmentRequest.findOneAndUpdate(
        { request_id: reqId, status: { $in: ['draft', 'reviewed'] } },
        { draft_content },
        { new: true }
      );

      if (!request) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'Request not found or not in editable state'
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Draft updated', request);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'DRAFT_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Sends the request, locking the checklist and enqueueing the email.
   */
  static async sendRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id, reqId } = req.params;
      
      const sentRequest = await RequestComposerService.sendRequest(id, reqId);

      sendSuccess(res, HttpStatusCode.OK, 'Request sent successfully', sentRequest);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SEND_REQUEST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /cases/:id/escalate
   * Manually triggers an escalation for the case.
   */
  static async escalateCase(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'reason is required'
        });
        return;
      }

      // We need factsUsed for the summary draft
      const factsObject = await buildFactsObject(id);

      const escalation = await InvestigationOrchestrator.triggerEscalation(id, reason, factsObject);

      sendSuccess(res, HttpStatusCode.CREATED, 'Escalation raised successfully', escalation);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'ESCALATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /cases/:id/analysis/:snapshotId/correct
   * Correct an existing snapshot with a manual override message.
   */
  static async correctSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const { id, snapshotId } = req.params;
      const { correction_message } = req.body;

      if (!correction_message) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'correction_message is required'
        });
        return;
      }

      const newSnapshot = await InvestigationOrchestrator.correctSnapshot(id, snapshotId, correction_message);

      sendSuccess(res, HttpStatusCode.CREATED, 'Snapshot corrected successfully', newSnapshot);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'CORRECTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /cases/:id/analysis/manual
   * Create a completely manual snapshot without LLM assistance.
   */
  static async createManualSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { ranked_next_steps, suspect_candidates, narrative_summary, suggested_legal_sections } = req.body;

      if (!narrative_summary || !Array.isArray(ranked_next_steps) || !Array.isArray(suspect_candidates)) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'ranked_next_steps, suspect_candidates, and narrative_summary are required'
        });
        return;
      }

      const newSnapshot = await InvestigationOrchestrator.createManualSnapshot(id, {
        ranked_next_steps,
        suspect_candidates,
        narrative_summary,
        suggested_legal_sections,
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Manual snapshot created successfully', newSnapshot);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'MANUAL_SNAPSHOT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /cases/:id/diary
   * Fetch chronological diary entries.
   */
  static async getCaseDiary(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const entries = await DiaryEntry.find({ case_id: id }).sort({ timestamp: -1 }).lean();
      sendSuccess(res, HttpStatusCode.OK, 'Fetched diary entries', entries);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'DIARY_FETCH_FAILED',
        message: 'Failed to fetch diary entries'
      });
    }
  }

  /**
   * GET /cases/:id/checklist
   * Fetch the case checklist.
   */
  static async getCaseChecklist(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const steps = await CaseChecklist.find({ case_id: id }).lean();
      if (!steps || steps.length === 0) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'No checklist found for this case'
        });
        return;
      }
      sendSuccess(res, HttpStatusCode.OK, 'Fetched checklist', { steps });
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'CHECKLIST_FETCH_FAILED',
        message: 'Failed to fetch case checklist'
      });
    }
  }

  /**
   * POST /cases/:id/checklist/steps
   * Manually add a new step to the checklist (also used by Copilot "Apply" button).
   * This is the single code-path for step creation — both manual UI and Copilot proposals hit here.
   */
  static async addManualStep(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, description, criticality = 'medium' } = req.body;

      if (!title) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'MISSING_PARAM',
          message: 'title is required to add a step'
        });
        return;
      }

      const { v4: uuidv4 } = await import('uuid');

      const step = await CaseChecklist.create({
        case_id: id,
        sop_id: 'manual',
        step_id: uuidv4(),
        title,
        status: 'pending',
        criticality: ['high', 'medium', 'low'].includes(criticality) ? criticality : 'medium',
        required_evidence: description ? [description] : [],
        proof_evidence_ids: [],
      });

      await DiaryEntry.create({
        case_id: id,
        entry_id: uuidv4(),
        actor: { type: 'system', id: 'copilot' },
        event_type: 'manual_step_added',
        payload: { step_id: step.step_id, title },
        ref_ids: { step_id: step.step_id },
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Step added to checklist', step);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'STEP_ADD_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /cases/:id/requests
   * Fetch department requests.
   */
  static async getDepartmentRequests(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const requests = await DepartmentRequest.find({ case_id: id }).sort({ createdAt: -1 }).lean();
      sendSuccess(res, HttpStatusCode.OK, 'Fetched department requests', requests);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'REQUESTS_FETCH_FAILED',
        message: 'Failed to fetch department requests'
      });
    }
  }

  /**
   * GET /cases/:id/evidence
   * Fetch case evidence — merges IO/department Evidence records + complainant's original uploads.
   */
  static async getEvidence(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // 1. Structured Evidence documents (added by IO/dept)
      const evidenceDocs = await Evidence.find({ case_id: id }).sort({ createdAt: -1 }).lean() as any[];

      const formattedEvidenceDocs = evidenceDocs.map((ev: any) => {
        const summary = ev.aiMetadata?.aiSummary || ev.florence_description || ev.ai_description || ev.originalFilename || 'No description available.';
        const tags = ev.aiMetadata?.imageTags || ev.ai_tags || ev.tags || [];
        const ocr = ev.aiMetadata?.ocrText || ev.ocrText || ev.ocr_text || '';
        return {
          ...ev,
          originalFilename: ev.originalFilename || ev.filename || ev.title || ev.evidence_id,
          secureUrl: ev.secureUrl || ev.storage_ref,
          processingStatus: ev.processingStatus || (ev.status === 'verified' ? 'PROCESSED' : 'PENDING'),
          ai_description: summary,
          ai_tags: tags,
          aiMetadata: {
            ...ev.aiMetadata,
            aiSummary: summary,
            imageTags: tags,
            ocrText: ocr,
            speechTranscript: ev.aiMetadata?.speechTranscript || ev.transcript || '',
          },
        };
      });

      // 2. Original complainant uploads stored in Complaint.evidence[]
      const complaint = await Complaint.findById(id, { evidence: 1 }).lean() as any;
      const complainantFiles = (complaint?.evidence || []).map((ev: any, idx: number) => {
        const summary = ev.aiMetadata?.aiSummary || ev.florence_description || ev.ai_description || ev.originalFilename || 'Complainant uploaded file';
        const tags = ev.aiMetadata?.imageTags || ev.ai_tags || ev.tags || [];
        const ocr = ev.aiMetadata?.ocrText || ev.ocrText || ev.ocr_text || '';
        return {
          evidence_id: ev.publicId || `COMP-EV-${idx}`,
          type: ev.resourceType || 'document',
          storage_ref: ev.secureUrl || ev.publicId,
          secureUrl: ev.secureUrl,
          originalFilename: ev.originalFilename,
          ai_description: summary,
          ai_tags: tags,
          aiMetadata: {
            ...ev.aiMetadata,
            aiSummary: summary,
            imageTags: tags,
            ocrText: ocr,
          },
          processingStatus: ev.processingStatus || 'PROCESSED',
          status: (ev.processingStatus === 'PROCESSED' || ev.processingStatus === 'processed') ? 'verified' : 'pending',
          source: 'complainant',
          cloudinary_url: ev.secureUrl,
          original_filename: ev.originalFilename,
          uploaded_at: ev.uploadedAt,
        };
      });

      const combined = [...complainantFiles, ...formattedEvidenceDocs];
      sendSuccess(res, HttpStatusCode.OK, 'Fetched evidence', combined);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'EVIDENCE_FETCH_FAILED',
        message: 'Failed to fetch evidence'
      });
    }
  }

  /**
   * POST /cases/:id/evidence
   * Add evidence directly to a case (by IO).
   */
  static async addEvidence(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, title, description, tags, linked_step_id } = req.body;
      const ioId = (req as any).user?.sub ?? 'anonymous'; // fallback for mock
      
      const evidence = await Evidence.create({
        case_id: id,
        evidence_id: `EV-IO-${Date.now()}`,
        type: type || 'document',
        storage_ref: `mock-upload-${Date.now()}`,
        ai_description: description,
        ai_tags: tags || [],
        uploader_id: ioId,
        status: 'pending',
        source: 'io_officer',
        title: title
      });

      // Also log it in diary
      await DiaryEntry.create({
        case_id: id,
        entry_id: `DIARY-${Date.now()}`,
        event_type: 'evidence_added',
        actor: { type: 'officer', id: ioId },
        timestamp: new Date(),
        payload: {
          content: `IO added new evidence: ${title || type}`,
          evidence_id: evidence.evidence_id,
          linked_step_id
        },
        ref_ids: {
          evidence_id: evidence.evidence_id,
          step_id: linked_step_id
        }
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Evidence added successfully', evidence);
    } catch (error: any) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'EVIDENCE_ADD_FAILED',
        message: error.message || 'Failed to add evidence'
      });
    }
  }

  /**
   * POST /cases/:id/evidence/:evidenceId/transfer
   * Transfer physical evidence custody.
   */
  static async transferEvidence(req: Request, res: Response): Promise<void> {
    try {
      const { id, evidenceId } = req.params;
      const { from_entity, to_entity, status, notes, proof_storage_ref } = req.body;

      const evidence = await Evidence.findOne({ case_id: id, evidence_id: evidenceId });
      
      if (!evidence) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'EVIDENCE_NOT_FOUND',
          message: 'Evidence not found'
        });
        return;
      }

      if (!evidence.is_physical) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'NOT_PHYSICAL_EVIDENCE',
          message: 'Can only transfer physical evidence'
        });
        return;
      }

      const transfer = {
        timestamp: new Date(),
        from_entity,
        to_entity,
        status,
        notes,
        proof_storage_ref
      };

      evidence.custody_chain = evidence.custody_chain || [];
      evidence.custody_chain.push(transfer);

      // Update current location if received
      if (status === 'received' || status === 'returned') {
        evidence.current_location = to_entity;
      } else if (status === 'dispatched' || status === 'in_transit') {
        evidence.current_location = `in_transit_${to_entity}`;
      }

      await evidence.save();

      sendSuccess(res, HttpStatusCode.OK, 'Evidence transferred successfully', evidence);
    } catch (error: any) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'EVIDENCE_TRANSFER_FAILED',
        message: error.message || 'Failed to transfer evidence'
      });
    }
  }

  /**
   * POST /cases/:id/checklist/:stepId/complete
   * Complete a checklist step. Requires proof for manual steps.
   */
  static async completeStep(req: Request, res: Response): Promise<void> {
    try {
      const { id, stepId } = req.params;
      const { proof_evidence_ids } = req.body;

      const step = await CaseChecklist.findOne({ case_id: id, step_id: stepId });
      if (!step) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'STEP_NOT_FOUND',
          message: `Step ${stepId} not found`
        });
        return;
      }

      // If it's a manual step (no locked_by_request_id), it MUST have proof.
      // Wait, let's use the criteria "manual/officer-performed steps" which the user defined as "NOT tied to a department_request"
      if (!step.locked_by_request_id) {
        const hasExistingProof = step.proof_evidence_ids && step.proof_evidence_ids.length > 0;
        const hasNewProof = Array.isArray(proof_evidence_ids) && proof_evidence_ids.length > 0;

        if (!hasExistingProof && !hasNewProof) {
          sendError(res, HttpStatusCode.BAD_REQUEST, {
            code: 'PROOF_REQUIRED',
            message: 'Manual steps require at least one evidence_id as proof before completion.'
          });
          return;
        }

        // Apply new proof if provided
        if (hasNewProof) {
          step.proof_evidence_ids = [...new Set([...(step.proof_evidence_ids || []), ...proof_evidence_ids])];
        }
      }

      step.status = 'completed';
      step.completed_at = new Date();
      await step.save();

      // Log in diary
      const ioId = (req as any).user?.sub ?? 'anonymous';
      await DiaryEntry.create({
        case_id: id,
        entry_id: `DIARY-${Date.now()}`,
        event_type: 'checklist_step_completed',
        actor: { type: 'officer', id: ioId },
        timestamp: new Date(),
        payload: {
          step_id: stepId,
          proof_provided: step.proof_evidence_ids
        },
        ref_ids: { step_id: stepId }
      });

      sendSuccess(res, HttpStatusCode.OK, 'Step marked as complete', step);
    } catch (error: any) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'STEP_COMPLETE_FAILED',
        message: error.message || 'Failed to complete step'
      });
    }
  }

  /**
   * GET /cases/:id/threads
   * Fetch all RequestThreads for a case.
   */
  static async getThreads(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { RequestThread } = require('../models/RequestThread.model');
      const threads = await RequestThread.find({ case_id: id }).sort({ updatedAt: -1 }).lean();
      sendSuccess(res, HttpStatusCode.OK, 'Threads fetched successfully', threads);
    } catch (error: any) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'FETCH_THREADS_FAILED',
        message: error.message || 'Failed to fetch threads'
      });
    }
  }

  /**
   * GET /cases/threads/:threadId
   * Fetch a specific RequestThread by ID.
   */
  static async getThreadById(req: Request, res: Response): Promise<void> {
    try {
      const { threadId } = req.params;
      const { RequestThread } = require('../models/RequestThread.model');
      const thread = await RequestThread.findById(threadId).lean();
      if (!thread) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'Thread not found'
        });
        return;
      }
      sendSuccess(res, HttpStatusCode.OK, 'Thread fetched successfully', thread);
    } catch (error: any) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'FETCH_THREAD_FAILED',
        message: error.message || 'Failed to fetch thread'
      });
    }
  }

  /**
   * POST /cases/threads/:threadId/reply
   * Add a new message to a RequestThread (from IO).
   */
  static async replyToThread(req: Request, res: Response): Promise<void> {
    try {
      const { threadId } = req.params;
      const { content, attachments, sender = 'io' } = req.body;
      const { RequestThread } = require('../models/RequestThread.model');
      const { Evidence } = require('../models/Evidence.model');
      const { CaseChecklist } = require('../models/CaseChecklist.model');
      const { v4: uuidv4 } = require('uuid');

      if (!content) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'content is required'
        });
        return;
      }

      const thread = await RequestThread.findById(threadId);
      if (!thread) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'Thread not found'
        });
        return;
      }

      thread.messages.push({
        sender,
        content,
        timestamp: new Date(),
        attachments: attachments || []
      });
      
      thread.unread_by_io = sender === 'department';
      await thread.save();

      const evidenceIds = [];
      if (sender === 'department' && attachments && attachments.length > 0) {
        for (const url of attachments) {
          const evidence = new Evidence({
            case_id: thread.case_id,
            evidence_id: uuidv4(),
            type: 'document',
            storage_ref: url,
            uploader_id: new Types.ObjectId(), // mocked dept user ID
            status: 'pending',
            source: 'department',
            origin: 'post_complaint_request',
            linked_request_id: thread.request_id,
            ai_description: `Uploaded by ${thread.department_entity_id}`,
            ai_tags: [thread.department_entity_id.toLowerCase()],
          });
          await evidence.save();
          evidenceIds.push(evidence.evidence_id);
        }
      }

      if (sender === 'department') {
        const step = await CaseChecklist.findOne({ case_id: thread.case_id, step_id: thread.step_id });
        if (step) {
          step.status = 'completed';
          step.completed_at = new Date();
          step.proof_evidence_ids = evidenceIds;
          await step.save();
        }

        // Auto-trigger a new AI analysis now that new evidence/context has arrived.
        // Fire-and-forget — we don't block the HTTP response on this.
        InvestigationOrchestrator.runAnalysis(thread.case_id, 'department_response').catch((err: Error) => {
          logger.error(`[AutoTrigger] AI analysis after department response failed for case ${thread.case_id}: ${err.message}`);
        });
      }

      // Log in diary
      const actorType = sender === 'io' ? 'officer' : 'department';
      const actorId = sender === 'io' ? ((req as any).user?.sub ?? 'anonymous') : 'system';
      const eventType = sender === 'io' ? 'request_sent' : 'evidence_collected';

      await DiaryEntry.create({
        case_id: thread.case_id,
        entry_id: `DIARY-${Date.now()}`,
        event_type: eventType,
        actor: { type: actorType, id: actorId },
        timestamp: new Date(),
        payload: {
          thread_id: thread._id,
          content: content,
          department: thread.department_entity_id,
          attachments
        },
        ref_ids: { request_id: thread.request_id }
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Reply added successfully', thread);
    } catch (error: any) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'REPLY_FAILED',
        message: error.message || 'Failed to reply to thread'
      });
    }
  }

  /**
   * POST /cases/:id/threads/:thread_id/export-pdf
   * Generates a PDF of the chat and uploads it as Evidence.
   */
  static async exportThreadToPdf(req: Request, res: Response): Promise<void> {
    try {
      const { id, thread_id } = req.params;
      const { RequestThread } = await import('../models/RequestThread.model');
      const thread = await RequestThread.findOne({ case_id: id, request_id: thread_id });
      if (!thread) {
        sendError(res, HttpStatusCode.NOT_FOUND, { code: 'NOT_FOUND', message: 'Thread not found' });
        return;
      }

      // Generate PDF in memory buffer
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      
      const p = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
      });

      // PDF Content
      doc.fontSize(20).text('Department Communication Evidence', { align: 'center' }).moveDown();
      doc.fontSize(12).text(`Case ID: ${id}`);
      doc.text(`Thread ID: ${thread_id}`);
      doc.text(`Department: ${thread.department_entity_id}`);
      doc.text(`Generated At: ${new Date().toLocaleString('en-IN')}`).moveDown(2);

      doc.fontSize(14).text('Chat History:', { underline: true }).moveDown();
      
      thread.messages.forEach((msg: any) => {
        const sender = msg.sender === 'io' ? 'Investigating Officer' : thread.department_entity_id;
        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString('en-IN') : 'Unknown Time';
        doc.fontSize(10).fillColor('gray').text(`[${time}] ${sender}:`);
        doc.fontSize(12).fillColor('black').text(msg.content, { align: 'justify' }).moveDown();
      });

      doc.end();
      const pdfBuffer = await p;

      // Upload to cloudinary
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'raw', folder: 'crime_os_evidence', format: 'pdf' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(pdfBuffer);
      });

      const ioId = (req as any).user?.sub ?? 'anonymous';
      
      // Save as Evidence
      const newEvidence = new Evidence({
        case_id: id,
        evidence_id: uuidv4(),
        type: 'document',
        storage_ref: uploadResult.secure_url,
        uploader_id: ioId,
        status: 'verified',
        source: 'department',
        linked_request_id: thread_id
      });
      await newEvidence.save();

      // Log in Diary
      await DiaryEntry.create({
        case_id: id,
        entry_id: uuidv4(),
        actor: { type: 'system', id: 'pdf_exporter' },
        event_type: 'evidence_added',
        payload: {
          filename: `Thread_Export_${thread_id}.pdf`,
          type: 'document',
          url: uploadResult.secure_url,
          source: 'thread_export'
        },
        ref_ids: { evidence_id: newEvidence.evidence_id, request_id: thread_id }
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Thread exported as PDF evidence', { url: uploadResult.secure_url, evidence_id: newEvidence.evidence_id });
    } catch (error: any) {
      console.error('PDF Export Error:', error);
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'EXPORT_FAILED',
        message: error.message || 'Failed to export thread as PDF'
      });
    }
  }

  /**
   * POST /cases/threads/:threadId/format-response
   * Uses AI to formally format a rough department response.
   */
  static async formatThreadResponse(req: Request, res: Response): Promise<void> {
    try {
      const { threadId } = req.params;
      const { content } = req.body;

      if (!content) {
        sendError(res, HttpStatusCode.BAD_REQUEST, { code: 'INVALID_INPUT', message: 'content is required' });
        return;
      }

      const thread = await RequestThread.findById(threadId).lean();
      if (!thread) {
        sendError(res, HttpStatusCode.NOT_FOUND, { code: 'NOT_FOUND', message: 'Thread not found' });
        return;
      }

      const systemPrompt = `You are a professional assistant helping a government department rewrite a rough, casual response into a highly formal, official response to a police Investigating Officer. Ensure the tone is objective, professional, and clear. Do not add any hallucinated information; only rephrase the provided content.`;
      
      const userPrompt = `Context (What the Police asked): ${thread.step_title}\n\nRough Response from Department:\n${content}\n\nPlease rewrite this into a formal response.`;

      let formattedResponse = content; // Fallback
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
