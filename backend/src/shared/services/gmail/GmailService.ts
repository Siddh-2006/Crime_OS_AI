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
import { Readable } from 'stream';
import cloudinary from '../../../config/cloudinary';
import env from '../../../config/env';
import logger from '../../../config/logger';

import { DepartmentRequest } from '../../../modules/investigation/models/DepartmentRequest.model';
import { RequestThread } from '../../../modules/investigation/models/RequestThread.model';
import { CaseChecklist } from '../../../modules/investigation/models/CaseChecklist.model';
import { Evidence } from '../../../modules/investigation/models/Evidence.model';
import { DiaryEntry } from '../../../modules/investigation/models/DiaryEntry.model';
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

function mimeToCloudinaryResourceType(mime: string): 'image' | 'video' | 'raw' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video';
  return 'raw';
}

// ─── Extract plain-text body from a Gmail message ────────────────────────────

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  // Direct body data on the payload itself
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Recurse through parts looking for text/plain
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      // Nested multipart
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

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

// ─── Upload a raw Buffer to Cloudinary ───────────────────────────────────────

async function uploadBufferToCloudinary(
  buffer: Buffer,
  _filename: string,
  mimeType: string,
  caseId: string,
  subfolder: 'department_responses' | 'complainant_responses',
): Promise<{ secureUrl: string; publicId: string }> {
  const resourceType = mimeToCloudinaryResourceType(mimeType);
  const folder = `crime-os/${subfolder}/${caseId}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `dept_${uuidv4()}`,
        resource_type: resourceType,
        overwrite: false,
      },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

// ─── Core ingestion — mirrors DepartmentPortalController.respondToRequest ────

async function ingestResponse(opts: {
  caseId: string;
  requestId: string;
  departmentEntityId: string;
  responseContent: string;
  attachments: Array<{ filename: string; mimeType: string; secureUrl: string; publicId: string }>;
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
    const evidenceId = uuidv4();
    evidenceIds.push(evidenceId);
    await Evidence.create({
      case_id:            request.case_id,
      evidence_id:        evidenceId,
      type:               mimeToEvidenceType(att.mimeType),
      storage_ref:        att.secureUrl,
      ai_description:     `Attachment "${att.filename}" from ${sender === 'citizen' ? 'citizen' : 'department'} email response.`,
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

  // 7. Trigger AI re-analysis (fire and forget)
  InvestigationOrchestrator.runAnalysis(caseId.toString()).catch((err) => {
    logger.error(`[GmailService] AI re-analysis failed after email ingestion`, { caseId, error: err.message });
  });
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

    const complaintIdMatch = body.match(/complaint\s+id\s*:\s*([^\s\n\r,]+)/i);
    const requestIdMatch = body.match(/request\s+id\s*:\s*([^\s\n\r,]+)/i);
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

    const responseFolder = request.recipient_type === 'citizen' ? 'complainant_responses' : 'department_responses';
  const senderType = isCitizenReply ? 'citizen' : 'department';

    // Download and upload all attachments
    const uploadedAttachments: Array<{
      filename: string;
      mimeType: string;
      secureUrl: string;
      publicId: string;
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
        const { secureUrl, publicId } = await uploadBufferToCloudinary(
          buffer,
          part.filename,
          part.mimeType,
          resolvedCaseId,
          responseFolder,
        );

        uploadedAttachments.push({
          filename:  part.filename,
          mimeType:  part.mimeType,
          secureUrl,
          publicId,
        });

        logger.info(`[GmailService] Uploaded attachment "${part.filename}" to Cloudinary.`);
      } catch (attErr: any) {
        logger.error(`[GmailService] Failed to upload attachment "${part.filename}"`, { error: attErr.message });
      }
    }

    // Ingest everything into the investigation workflow
    await ingestResponse({
      caseId:              resolvedCaseId,
      requestId:          request.request_id,
      departmentEntityId: request.department_entity_id ?? (senderType === 'citizen' ? 'Complainant' : 'unknown_department'),
      responseContent:    body,
      attachments:        uploadedAttachments,
      sender:             senderType,
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
