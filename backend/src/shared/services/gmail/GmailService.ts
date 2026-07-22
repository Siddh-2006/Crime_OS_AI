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
): Promise<{ secureUrl: string; publicId: string }> {
  const resourceType = mimeToCloudinaryResourceType(mimeType);
  const folder = `crime-os/department_responses/${caseId}`;

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
}): Promise<void> {
  const { caseId, requestId, departmentEntityId, responseContent, attachments } = opts;

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

  // 3. Ingest each attachment as an Evidence document
  const evidenceIds: string[] = [];

  // System ObjectId used as uploader for auto-ingested evidence (no real officer)
  // Using a well-known zero ObjectId as a "system" actor sentinel
  const SYSTEM_UPLOADER_ID = '000000000000000000000000';

  // Always ingest the text body as a document evidence
  const textEvidenceId = uuidv4();
  evidenceIds.push(textEvidenceId);
  await Evidence.create({
    case_id:            request.case_id,
    evidence_id:        textEvidenceId,
    type:               'document',
    storage_ref:        `email-body-${requestId}`,
    ai_description:     `Email response from ${departmentEntityId} via Gmail.`,
    ai_tags:            ['department_response', 'email'],
    uploader_id:        SYSTEM_UPLOADER_ID,
    status:             'verified',
    source:             'department',
    linked_request_id:  requestId,
  });

  // Ingest file attachments
  for (const att of attachments) {
    const evidenceId = uuidv4();
    evidenceIds.push(evidenceId);
    await Evidence.create({
      case_id:            request.case_id,
      evidence_id:        evidenceId,
      type:               mimeToEvidenceType(att.mimeType),
      storage_ref:        att.secureUrl,
      ai_description:     `Attachment "${att.filename}" from department email response.`,
      ai_tags:            ['department_response', 'email_attachment'],
      uploader_id:        SYSTEM_UPLOADER_ID,
      status:             'verified',
      source:             'department',
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
   * Only processes emails that contain "Complaint ID:" in the body.
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

    // Must contain "Complaint ID:" — otherwise not a department response
    const complaintIdMatch = body.match(/complaint\s+id\s*:\s*([^\s\n\r,]+)/i);
    if (!complaintIdMatch) {
      logger.debug(`[GmailService] Message ${messageId} has no "Complaint ID:" — skipping.`);
      // Still mark as read so we don't re-check it
      await GmailService._markAsRead(gmail, messageId);
      return;
    }

    const caseId = complaintIdMatch[1].trim();
    logger.info(`[GmailService] Processing reply for case: ${caseId}, message: ${messageId}`);

    // Find the DepartmentRequest for this case that is in 'sent' status
    const request = await DepartmentRequest.findOne({
      case_id: caseId,
      status:  'sent',
    }).sort({ sent_at: -1 }); // most recent sent request for this case

    if (!request) {
      logger.warn(`[GmailService] No 'sent' DepartmentRequest found for case ${caseId} — skipping ingestion.`);
      await GmailService._markAsRead(gmail, messageId);
      return;
    }

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
          caseId,
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
      caseId,
      requestId:          request.request_id,
      departmentEntityId: request.department_entity_id ?? 'unknown_department',
      responseContent:    body,
      attachments:        uploadedAttachments,
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
