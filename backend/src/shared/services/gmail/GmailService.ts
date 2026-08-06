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

  let rawBody = '';
  // Prefer plain text; fall back to HTML with tags stripped.
  // Concatenate ALL parts so that quoted original (which contains the IDs) is included.
  if (plainParts.length > 0) rawBody = plainParts.join('\n');
  else if (htmlParts.length > 0) rawBody = stripHtml(htmlParts.join('\n'));
  
  // Clean up quoted replies and signatures
  const lines = rawBody.split('\n');
  const cleanedLines: string[] = [];
  
  for (const line of lines) {
    // Stop processing if we hit common reply boundaries
    if (line.match(/^On .* wrote:$/) || 
        line.match(/^_{10,}$/) || 
        line.trim() === '--' ||
        line.startsWith('From: ')) {
      break;
    }
    // Skip quoted lines
    if (line.trim().startsWith('>')) {
      continue;
    }
    cleanedLines.push(line);
  }
  
  return cleanedLines.join('\n').trim();
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

  // 3. Generate upload token for Python AI Pipeline
  let uploadToken = '';
  try {
    const axios = require('axios');
    const env = require('../../../config/env').default;
    const tokenRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload-token/generate`, {
      case_id: request.case_id.toString(),
    });
    uploadToken = tokenRes.data.token;
  } catch (err: any) {
    logger.error(`[GmailService] Failed to generate upload token for case ${caseId}`, { error: err.message });
  }

  // 4. Upload files to Python and collect the final evidence IDs
  const evidenceIds: string[] = [];
  if (uploadToken && attachments.length > 0) {
    try {
      const FormData = require('form-data');
      const axios = require('axios');
      const env = require('../../../config/env').default;
      
      const formData = new FormData();
      for (const att of attachments) {
        formData.append('files', att.buffer, {
          filename: att.filename,
          contentType: att.mimeType,
        });
      }
      
      const pyRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload/${uploadToken}`, formData, {
        headers: formData.getHeaders(),
        timeout: 15000,
      });
      
      if (pyRes.data && pyRes.data.items) {
        for (const item of pyRes.data.items) {
          evidenceIds.push(item.evidence_id);
        }
      }
      logger.info(`[GmailService] Forwarded ${attachments.length} attachments. Received ${evidenceIds.length} IDs from Python AI.`);
    } catch (err: any) {
      logger.warn(`[GmailService] Failed to forward attachments to Python AI`, { error: err.message });
    }
  }

  // 5. Complete the linked CaseChecklist step
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
      // ASSIGNED_TO_IO or later → trigger ONLY:
      //   1. IO investigation orchestrator (updates IO dashboard AI analysis)
      logger.info(`[GmailService] Complaint ${caseId} is in ${complaintStatus ?? 'unknown'} — polling for evidence processing before Orchestrator run`);

      // Fire and forget polling loop so we don't block the Gmail worker
      (async () => {
        const MAX_RETRIES = 30; // 30 * 10s = 5 minutes
        let allProcessed = false;
        for (let i = 0; i < MAX_RETRIES; i++) {
          const currentEvidences = await Evidence.find({ case_id: caseId, evidence_id: { $in: evidenceIds } }).lean();
          const pendingCount = currentEvidences.filter((e: any) => e.processingStatus === 'PENDING').length;
          
          if (pendingCount === 0) {
            allProcessed = true;
            logger.info(`[GmailService] All attachments processed! Building summary prompt...`);
            
            const reqContext = request.draft_content;
            const repContext = responseContent;
            const aiExtracts = currentEvidences.map((e: any) => 
              `[${e.originalFilename}]: ${e.ai_description || 'No AI description'}\nTags: ${(e.ai_tags || []).join(', ')}`
            ).join('\n\n');

            const prompt = `CONVERSATION CONTEXT:
The Investigating Officer requested information:
"""${reqContext}"""

The ${sender} replied via email:
"""${repContext}"""

ATTACHED EVIDENCE AI ANALYSIS:
${aiExtracts || 'No attachments provided.'}

Update the checklist and analysis based on this new information.`.trim();

            await DiaryEntry.create({
              case_id: caseId,
              entry_id: uuidv4(),
              actor: { type: 'system', id: 'ai' },
              event_type: 'evidence_analysis_complete',
              payload: { content: prompt },
            });

            logger.info(`[GmailService] Triggering InvestigationOrchestrator for case ${caseId}`);
            InvestigationOrchestrator.runAnalysis(caseId.toString(), 'evidence_processed').catch(
              (err: Error) => logger.error(`[GmailService] Orchestrator re-analysis failed`, { caseId, error: err.message }),
            );
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        if (!allProcessed) {
          logger.warn(`[GmailService] Evidence processing timed out for case ${caseId}. Triggering Orchestrator anyway.`);
          InvestigationOrchestrator.runAnalysis(caseId.toString(), 'evidence_timeout').catch(
            (err: Error) => logger.error(`[GmailService] Orchestrator re-analysis failed`, { caseId, error: err.message }),
          );
        }
      })();
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
        const env = require('../../../config/env').default;
        
        // 1. Generate token
        const tokenRes = await axios.post(`${env.COMPLAINT_INTELLIGENCE_URL}/evidence/upload-token/generate`, {
          case_id: resolvedCaseId 
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

    // Strip original quoted email (e.g. "On Tue, Aug 4, 2026 at 7:29 PM Crime OS Gujarat Police <...> wrote:")
    let cleanBody = body.split(/On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+.*?wrote:/i)[0];
    cleanBody = cleanBody.split(/On\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}.*?wrote:/i)[0]; // Fallback date format
    cleanBody = cleanBody.split(/From:.*?To:.*?Subject:/is)[0]; // Outlook format
    cleanBody = cleanBody.trim();
    if (!cleanBody) cleanBody = body.trim(); // Fallback if everything was stripped

    await ingestResponse({
      caseId: resolvedCaseId,
      requestId: request.request_id,
      departmentEntityId: request.department_entity_id || 'unknown',
      responseContent: cleanBody,
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
