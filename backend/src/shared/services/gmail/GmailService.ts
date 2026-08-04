/**
 * GmailService.ts
 *
 * Responsibilities:
 *  1. Send department request emails via Gmail API (OAuth2) using Nodemailer + OAuth2 transport.
 *     — Sends through the police Gmail account so replies land in that inbox.
 *  2. Poll the police Gmail inbox for unread replies from departments.
 *     — Parses "Complaint ID: <id>" from the email body to identify the case.
 *     — Downloads all attachments (image / audio / video / document).
 *     — Uploads each attachment to Cloudinary.
 *     — Ingests everything into the investigation workflow (Evidence, DepartmentRequest,
 *       CaseChecklist, RequestThread, DiaryEntry) and fires AI re-analysis.
 *     — Marks processed emails as READ so they are never processed twice.
 */

import { google, gmail_v1 } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import env from '../../../config/env';
import logger from '../../../config/logger';

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DepartmentRequest } from '../../../modules/investigation/models/DepartmentRequest.model';
import { RequestThread } from '../../../modules/investigation/models/RequestThread.model';
import { CaseChecklist } from '../../../modules/investigation/models/CaseChecklist.model';
import { Evidence } from '../../../modules/investigation/models/Evidence.model';
import { DiaryEntry } from '../../../modules/investigation/models/DiaryEntry.model';
import { Complaint } from '../../../modules/complaint/models/Complaint.model';
import { ComplaintStatus } from '../../../modules/complaint/enums/complaintStatus.enum';
import { InvestigationOrchestrator } from '../../../modules/investigation/services/investigationOrchestrator';

// ─── OAuth2 client (singleton) ────────────────────────────────────────────────

function buildOAuth2Client() {
  const client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
  );
  client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  return client;
}

// ─── Mime-type → evidence type mapping ───────────────────────────────────────

function mimeToEvidenceType(mime: string): string {
  if (mime.startsWith('image/'))  return 'image';
  if (mime.startsWith('video/'))  return 'video';
  if (mime.startsWith('audio/'))  return 'audio';
  return 'document';
}

// ─── Strip HTML tags to get plain text ─────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

// ─── Extract all text content from a Gmail message (plain + HTML fallback) ────

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  const plainParts: string[] = [];
  const htmlParts: string[] = [];

  function walk(part: gmail_v1.Schema$MessagePart) {
    if (part.body?.data) {
      const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
      if (part.mimeType === 'text/plain') plainParts.push(decoded);
      else if (part.mimeType === 'text/html') htmlParts.push(decoded);
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(payload);

  // Prefer plain text; fall back to HTML with tags stripped.
  // Concatenate ALL parts so that quoted original (which contains the IDs) is included.
  if (plainParts.length > 0) return plainParts.join('\n');
  if (htmlParts.length > 0)  return stripHtml(htmlParts.join('\n'));
  return '';
}

// ─── Collect attachment parts from a message payload ─────────────────────────

interface AttachmentPart {
  filename: string;
  mimeType: string;
  attachmentId: string;
  size: number;
}

function collectAttachmentParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
): AttachmentPart[] {
  if (!payload) return [];
  const results: AttachmentPart[] = [];

  if (
    payload.filename &&
    payload.filename.trim() !== '' &&
    payload.body?.attachmentId
  ) {
    results.push({
      filename: payload.filename,
      mimeType: payload.mimeType ?? 'application/octet-stream',
      attachmentId: payload.body.attachmentId,
      size: payload.body.size ?? 0,
    });
  }

  for (const part of payload.parts ?? []) {
    results.push(...collectAttachmentParts(part));
  }

  return results;
}



// ─── Core ingestion — mirrors DepartmentPortalController.respondToRequest ────

async function ingestResponse(opts: {
  caseId: string;
  requestId: string;
  departmentEntityId: string;
  responseContent: string;
  attachments: Array<{ filename: string; mimeType: string; buffer?: Buffer; evidenceId?: string }>;
  sender: 'department' | 'citizen';
}): Promise<void> {
  const { caseId, requestId, departmentEntityId, responseContent, attachments, sender } = opts;

  // 1. Find the DepartmentRequest
  const request = await DepartmentRequest.findOne({ request_id: requestId });
  if (!request) {
    logger.warn(`[GmailService] DepartmentRequest not found for request_id: ${requestId}`);
    return;
  }
  if (request.status !== 'sent') {
    logger.warn(`[GmailService] Request ${requestId} is already in status: ${request.status} — skipping`);
    return;
  }

  // 2. Update DepartmentRequest
  request.status = 'response_received';
  request.response_ref = responseContent;
  request.response_at = new Date();
  await request.save();

  // 3. Ingest file attachments as Evidence documents only
  const evidenceIds: string[] = [];

  // System ObjectId used as uploader for auto-ingested evidence (no real officer)
  const SYSTEM_UPLOADER_ID = '000000000000000000000000';

  for (const att of attachments) {
    const evidenceId = att.evidenceId || uuidv4();
    evidenceIds.push(evidenceId);
    
    // Store it in Node.js Evidence collection (with status: pending)
    // The Python worker will update this document with storage_ref and aiMetadata when it finishes.
    await Evidence.create({
      case_id:            request.case_id,
      evidence_id:        evidenceId,
      type:               mimeToEvidenceType(att.mimeType),
      storage_ref:        'PENDING_UPLOAD',
      originalFilename:   att.filename,
      mimeType:           att.mimeType,
      processingStatus:   'PENDING',
      ai_description:     `Attachment "${att.filename}" from ${sender === 'citizen' ? 'citizen' : 'department'} email response. (AI Processing...)`,
      ai_tags:            [sender === 'citizen' ? 'citizen_response' : 'department_response', 'email_attachment'],
      uploader_id:        SYSTEM_UPLOADER_ID,
      status:             'verified',
      source:             sender === 'citizen' ? 'complainant' : 'department',
      linked_request_id:  requestId,
    });
  }

  // 4. Complete the linked CaseChecklist step
  const checklistStep = await CaseChecklist.findOne({
    case_id: request.case_id,
    step_id: request.step_id,
  });
  if (checklistStep) {
    checklistStep.status = 'completed';
    checklistStep.proof_evidence_ids.push(...evidenceIds);
    checklistStep.completed_at = new Date();
    // Unlock the step
    checklistStep.locked_by_request_id = undefined;
    await checklistStep.save();
  }

  // 5. Append message to RequestThread
  const thread = await RequestThread.findOne({ request_id: requestId });
  if (thread) {
    thread.messages.push({
      sender:      'department',
      content:     responseContent,
      timestamp:   new Date(),
      attachments: evidenceIds,
    });
    thread.unread_by_io = true;
    await thread.save();
  }

  // 6. Append DiaryEntry
  await DiaryEntry.create({
    case_id:    request.case_id,
    entry_id:   uuidv4(),
    actor:      { type: 'department', id: departmentEntityId },
    event_type: 'response_received',
    payload:    {
      request_id:   requestId,
      evidence_ids: evidenceIds,
      content:      responseContent,
      source:       'email',
    },
    ref_ids: { request_id: requestId },
  });

  logger.info(`[GmailService] Response ingested for request ${requestId}, case ${caseId}, evidence count: ${evidenceIds.length}`);

  // 7. Dual AI re-analysis based on complaint status (fire and forget)
  try {
    const complaintDoc = await Complaint.findById(caseId).lean();
    const complaintStatus = (complaintDoc as any)?.status as ComplaintStatus | undefined;
    const complaintNumber = (complaintDoc as any)?.complaintNumber as string | undefined;

    const preAssignmentStatuses: ComplaintStatus[] = [ComplaintStatus.SUBMITTED, ComplaintStatus.UNDER_REVIEW];
    const isPreAssignment = complaintStatus && preAssignmentStatuses.includes(complaintStatus);

    if (isPreAssignment && complaintNumber) {
      // SUBMITTED / UNDER_REVIEW → complaint_intelligence pipeline only
      logger.info(`[GmailService] Complaint ${caseId} is in ${complaintStatus} — re-triggering complaint_intelligence pipeline only`);
      _spawnComplaintIntelligence(complaintNumber);
    } else if (complaintNumber) {
      // ASSIGNED_TO_IO or later → trigger BOTH:
      //   1. IO investigation orchestrator (updates IO dashboard AI analysis)
      //   2. complaint_intelligence pipeline (updates the broader complaint understanding)
      logger.info(`[GmailService] Complaint ${caseId} is in ${complaintStatus ?? 'unknown'} — triggering BOTH InvestigationOrchestrator AND complaint_intelligence`);

      // 1. IO dashboard AI analysis (fire and forget)
      InvestigationOrchestrator.runAnalysis(caseId.toString(), 'citizen_evidence_received').catch(
        (err: Error) => logger.error(`[GmailService] Orchestrator re-analysis failed`, { caseId, error: err.message }),
      );

      // 2. complaint_intelligence pipeline (fire and forget — runs in background)
      _spawnComplaintIntelligence(complaintNumber);
    }
  } catch (err: any) {
    logger.error(`[GmailService] Failed to determine re-analysis route for case ${caseId}`, { error: err.message });
  }
}

// ─── Helper: spawn the complaint_intelligence Python pipeline ─────────────────

function _spawnComplaintIntelligence(complaintNumber: string): void {
  try {
    const scriptPath = path.resolve(
      __dirname,
      '../../../../../services/complaint_intelligence/run_pipeline_from_atlas.py',
    );
    const venvPython = path.resolve(
      __dirname,
      '../../../../../services/complaint_intelligence/.venv/Scripts/python.exe',
    );
    const pythonExec =
      process.platform === 'win32' && fs.existsSync(venvPython) ? venvPython : 'python';
    const scriptDir = path.dirname(scriptPath);

    const pyProcess = spawn(pythonExec, [scriptPath, complaintNumber], {
      cwd: scriptDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', MONGODB_DB: 'test' },
    });
    pyProcess.stdout?.on('data', (d: Buffer) =>
      d.toString('utf-8').split(/\r?\n/).filter(Boolean).forEach((l: string) =>
        logger.info(`[ComplaintIntelligence] ${l}`)
      )
    );
    pyProcess.stderr?.on('data', (d: Buffer) =>
      d.toString('utf-8').split(/\r?\n/).filter(Boolean).forEach((l: string) =>
        logger.warn(`[ComplaintIntelligence] ${l}`)
      )
    );
    pyProcess.on('close', (code: number) =>
      logger.info(`[ComplaintIntelligence] Pipeline exited with code ${code} for ${complaintNumber}`)
    );
  } catch (err: any) {
    logger.warn(`[GmailService] Failed to spawn complaint_intelligence for ${complaintNumber}: ${err.message}`);
  }
}


// ─── Public API ───────────────────────────────────────────────────────────────

export class GmailService {
  /**
   * Poll the police Gmail inbox for unread department reply emails.
   * Processes emails that contain either "Complaint ID:" or "Request ID:" in the body.
   * Marks each processed email as READ to prevent double-processing.
   */
  static async pollAndIngestReplies(): Promise<void> {
    // logger.info('[GmailService] Starting inbox poll...');

    const auth = buildOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    // Search for unread emails in inbox only
    let messageIds: string[] = [];
    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread in:inbox',
        maxResults: 20,
      });
      messageIds = (listRes.data.messages ?? []).map((m) => m.id!).filter(Boolean);
    } catch (err: any) {
      logger.error('[GmailService] Failed to list Gmail messages', { error: err.message });
      return;
    }

    if (messageIds.length === 0) {
      // logger.debug('[GmailService] No unread messages found.');
      return;
    }

    logger.info(`[GmailService] Found ${messageIds.length} unread message(s).`);

    for (const messageId of messageIds) {
      try {
        await GmailService._processMessage(gmail, messageId);
      } catch (err: any) {
        logger.error(`[GmailService] Error processing message ${messageId}`, { error: err.message });
        // Continue to next message — don't abort the whole poll
      }
    }
  }

  private static async _processMessage(
    gmail: gmail_v1.Gmail,
    messageId: string,
  ): Promise<void> {
    // Fetch full message
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id:     messageId,
      format: 'full',
    });
    const msg = msgRes.data;

    // Extract plain-text body
    const body = extractBody(msg.payload ?? undefined);

    const complaintIdMatch   = body.match(/complaint\s+id\s*:\s*([^\s\n\r,]+)/i);
    const requestIdMatch     = body.match(/request\s+id\s*:\s*([^\s\n\r,]+)/i);
    // Support both 'Reply Origin: X' (department template) and 'Responder: X' (citizen template)
    const responseOriginMatch = body.match(/(?:reply\s+origin|responder)\s*:\s*([^\s\n\r,]+)/i);

    if (!complaintIdMatch && !requestIdMatch) {
      logger.debug(`[GmailService] Message ${messageId} has no "Complaint ID:" or "Request ID:" — skipping.`);
      await GmailService._markAsRead(gmail, messageId);
      return;
    }

    const caseId = complaintIdMatch?.[1]?.trim();
    const requestId = requestIdMatch?.[1]?.trim();
    const responseOrigin = responseOriginMatch?.[1]?.trim().toLowerCase();
    const isDepartmentReply = responseOrigin === 'department';
    const isCitizenReply = responseOrigin === 'complainant' || responseOrigin === 'citizen';

    logger.info(
      `[GmailService] Processing reply for case: ${caseId ?? '<unknown>'}, request: ${requestId ?? '<none>'}, origin: ${responseOrigin ?? '<unknown>'}, message: ${messageId}`,
    );

    let request = null as any;
    if (requestId) {
      const requestFilter: Record<string, unknown> = { request_id: requestId, status: 'sent' };
      if (isDepartmentReply) {
        requestFilter.request_type = { $in: ['external_department', 'inter_station_assignment'] };
        requestFilter.recipient_type = { $ne: 'citizen' };
      }
      if (isCitizenReply) {
        requestFilter.request_type = 'citizen_request';
        requestFilter.recipient_type = 'citizen';
      }
      request = await DepartmentRequest.findOne(requestFilter);
    } else if (caseId) {
      if (!responseOrigin) {
        logger.warn(`[GmailService] Reply origin is missing for case-only match on case ${caseId}; requestId is required.`);
      } else {
        const requestFilter: Record<string, unknown> = { case_id: caseId, status: 'sent' };
        if (isDepartmentReply) {
          requestFilter.request_type = { $in: ['external_department', 'inter_station_assignment'] };
          requestFilter.recipient_type = { $ne: 'citizen' };
        }
        if (isCitizenReply) {
          requestFilter.request_type = 'citizen_request';
          requestFilter.recipient_type = 'citizen';
        }
        const candidateRequests = await DepartmentRequest.find(requestFilter).sort({ sent_at: -1 }).limit(2);
        if (candidateRequests.length === 1) {
          request = candidateRequests[0];
        } else if (candidateRequests.length > 1) {
          logger.warn(`[GmailService] Ambiguous sent request match for case ${caseId}; requestId is required when multiple requests are open.`);
        }
      }
    }

    if (!request) {
      logger.warn(
        `[GmailService] No matching 'sent' DepartmentRequest found for case ${caseId ?? '<unknown>'}` +
        `${requestId ? ` and request ${requestId}` : ''} — skipping ingestion.`,
      );
      await GmailService._markAsRead(gmail, messageId);
      return;
    }

    if (responseOrigin && request.recipient_type === 'citizen' && !isCitizenReply) {
      logger.warn(`[GmailService] Reply origin mismatch: expected complainant response for request ${request.request_id}.`);
      await GmailService._markAsRead(gmail, messageId);
      return;
    }
    if (responseOrigin && request.recipient_type !== 'citizen' && isCitizenReply) {
      logger.warn(`[GmailService] Reply origin mismatch: expected department response for request ${request.request_id}.`);
      await GmailService._markAsRead(gmail, messageId);
      return;
    }

    const resolvedCaseId = request?.case_id?.toString() ?? caseId;
    if (!resolvedCaseId) {
      logger.error(`[GmailService] Unable to resolve caseId for request ${request?.request_id ?? '<unknown>'}. Aborting ingestion.`);
      await GmailService._markAsRead(gmail, messageId);
      return;
    }

    const senderType = isCitizenReply ? 'citizen' : 'department';

    // Download and process all attachments
    const uploadedAttachments: Array<{
      filename: string;
      mimeType: string;
      buffer: Buffer;
      evidenceId?: string;
    }> = [];

    const attachmentParts = collectAttachmentParts(msg.payload ?? undefined);
    for (const part of attachmentParts) {
      try {
        const attRes = await gmail.users.messages.attachments.get({
          userId:       'me',
          messageId:    messageId,
          id:           part.attachmentId,
        });
        const data = attRes.data.data;
        if (!data) continue;

        const buffer = Buffer.from(data, 'base64');
        uploadedAttachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          buffer: buffer,
        });
      } catch (err: any) {
        logger.error(`[GmailService] Failed to download/process attachment ${part.attachmentId}`, { error: err.message });
      }
    }

    // --- Forward to Python AI Engine ---
    if (uploadedAttachments.length > 0) {
      try {
        const FormData = require('form-data');
        const axios = require('axios');
        const env = require('../../config/env').default;
        
        // 1. Generate token
        const tokenRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload-token/generate`, null, {
          params: { case_id: resolvedCaseId }
        });
        const token = tokenRes.data.token;

        // 2. Upload files
        const formData = new FormData();
        formData.append('uploader_type', senderType);
        for (const att of uploadedAttachments) {
          formData.append('files', att.buffer, {
            filename: att.filename,
            contentType: att.mimeType,
          });
        }
        
        const uploadRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload/${token}`, formData, {
          headers: formData.getHeaders(),
          timeout: 30000,
        });
        
        // Attach evidenceIds back to attachments for ingestResponse
        uploadRes.data.items.forEach((item: any, idx: number) => {
           uploadedAttachments[idx].evidenceId = item.evidence_id;
        });
      } catch (err: any) {
        logger.error(`[GmailService] Python AI upload failed: ${err.message}`, { error: err.response?.data || err.message });
      }
    }

    await ingestResponse({
      caseId: resolvedCaseId,
      requestId: request.request_id,
      departmentEntityId: request.department_entity_id || 'unknown',
      responseContent: body,
      attachments: uploadedAttachments,
      sender: senderType,
    });

    // Mark email as READ — prevents double-processing
    await GmailService._markAsRead(gmail, messageId);
    logger.info(`[GmailService] Message ${messageId} marked as read.`);
  }

  private static async _markAsRead(gmail: gmail_v1.Gmail, messageId: string): Promise<void> {
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id:     messageId,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
      logger.debug(`[GmailService] Marked message ${messageId} as read.`);
    } catch (err: any) {
      logger.error(`[GmailService] Failed to mark message ${messageId} as read — it will be re-processed next poll.`, { error: err.message });
    }
  }
}
