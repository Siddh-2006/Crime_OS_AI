/**
 * force-ingest-replies.ts
 *
 * One-off script that fetches ALL emails (read OR unread) in the Gmail inbox
 * that contain "Complaint ID:" or "Request ID:" and ingests any whose
 * linked DepartmentRequest still has status = 'sent' (i.e., not yet processed).
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/force-ingest-replies.ts
 */
import 'dotenv/config';
import { google, gmail_v1 } from 'googleapis';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '../config/cloudinary';
import env from '../config/env';
import logger from '../config/logger';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { DepartmentRequest } from '../modules/investigation/models/DepartmentRequest.model';
import { RequestThread }     from '../modules/investigation/models/RequestThread.model';
import { CaseChecklist }     from '../modules/investigation/models/CaseChecklist.model';
import { Evidence }          from '../modules/investigation/models/Evidence.model';
import { DiaryEntry }        from '../modules/investigation/models/DiaryEntry.model';
import { InvestigationOrchestrator } from '../modules/investigation/services/investigationOrchestrator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildOAuth2Client() {
  const client = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  client.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  return client;
}

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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';
  const plain: string[] = [];
  const html:  string[] = [];

  function walk(p: gmail_v1.Schema$MessagePart) {
    if (p.body?.data) {
      const text = Buffer.from(p.body.data, 'base64').toString('utf-8');
      if (p.mimeType === 'text/plain') plain.push(text);
      else if (p.mimeType === 'text/html') html.push(text);
    }
    for (const child of p.parts ?? []) walk(child);
  }
  walk(payload);

  if (plain.length > 0) return plain.join('\n');
  if (html.length  > 0) return stripHtml(html.join('\n'));
  return '';
}

interface AttachmentPart {
  filename: string; mimeType: string; attachmentId: string; size: number;
}

function collectAttachments(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentPart[] {
  if (!payload) return [];
  const out: AttachmentPart[] = [];
  if (payload.filename?.trim() && payload.body?.attachmentId) {
    out.push({ filename: payload.filename, mimeType: payload.mimeType ?? 'application/octet-stream',
               attachmentId: payload.body.attachmentId, size: payload.body.size ?? 0 });
  }
  for (const p of payload.parts ?? []) out.push(...collectAttachments(p));
  return out;
}

async function uploadToCloudinary(buffer: Buffer, mimeType: string, caseId: string): Promise<{ secureUrl: string; publicId: string }> {
  const resourceType = mimeToCloudinaryResourceType(mimeType);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `crime-os/department_responses/${caseId}`, public_id: `forced_${uuidv4()}`,
        resource_type: resourceType, overwrite: false },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

// ─── Ingest a single reply ────────────────────────────────────────────────────

async function ingest(opts: {
  caseId: string; requestId: string; departmentEntityId: string;
  responseContent: string; attachments: Array<{ filename: string; mimeType: string; secureUrl: string; publicId: string }>;
  sender: 'department' | 'citizen';
}): Promise<void> {
  const { caseId, requestId, departmentEntityId, responseContent, attachments, sender } = opts;

  const request = await DepartmentRequest.findOne({ request_id: requestId });
  if (!request) { logger.warn(`No DepartmentRequest found for request_id: ${requestId}`); return; }
  if (request.status !== 'sent') { logger.warn(`Request ${requestId} already processed (status: ${request.status})`); return; }

  request.status       = 'response_received';
  request.response_ref = responseContent;
  request.response_at  = new Date();
  await request.save();

  const SYSTEM_ID = '000000000000000000000000';
  const evidenceIds: string[] = [];

  for (const att of attachments) {
    const eid = uuidv4();
    evidenceIds.push(eid);
    const { SightEngineService } = require('../../../shared/services/sightengine/SightEngineService');
    const emailScore = await SightEngineService.evaluateConfidence({
      secureUrl: att.secureUrl,
      mimeType: att.mimeType,
      originalFilename: att.filename,
    });
    await Evidence.create({
      case_id: request.case_id, evidence_id: eid, type: mimeToEvidenceType(att.mimeType),
      storage_ref: att.secureUrl, ai_description: `Attachment "${att.filename}" from ${sender} email reply.`,
      ai_tags: [sender === 'citizen' ? 'citizen_response' : 'department_response', 'email_attachment', 'force_ingested'],
      uploader_id: SYSTEM_ID, status: 'verified',
      source: sender === 'citizen' ? 'complainant' : 'department',
      confidence_score: emailScore,
      linked_request_id: requestId,
    });
  }

  const checklist = await CaseChecklist.findOne({ case_id: request.case_id, step_id: request.step_id });
  if (checklist) {
    checklist.status = 'completed';
    checklist.proof_evidence_ids.push(...evidenceIds);
    checklist.completed_at = new Date();
    checklist.locked_by_request_id = undefined;
    await checklist.save();
  }

  const thread = await RequestThread.findOne({ request_id: requestId });
  if (thread) {
    thread.messages.push({ sender: 'department', content: responseContent, timestamp: new Date(), attachments: evidenceIds });
    thread.unread_by_io = true;
    await thread.save();
  }

  await DiaryEntry.create({
    case_id: request.case_id, entry_id: uuidv4(),
    actor: { type: 'department', id: departmentEntityId },
    event_type: 'response_received',
    payload: { request_id: requestId, evidence_ids: evidenceIds, content: responseContent, source: 'email_force_ingested' },
    ref_ids: { request_id: requestId },
  });

  logger.info(`✅ Ingested reply for request ${requestId} / case ${caseId}`);

  InvestigationOrchestrator.runAnalysis(caseId.toString()).catch(() => {});
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await connectDatabase();
  logger.info('Connected to MongoDB');

  const auth  = buildOAuth2Client();
  const gmail = google.gmail({ version: 'v1', auth });

  // Search ALL messages (read + unread) that contain the IDs - not filtered by unread
  const queries = [
    'in:inbox "Complaint ID:"',
    'in:inbox "Request ID:"',
  ];

  const messageIdSet = new Set<string>();
  for (const q of queries) {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 50 });
    for (const m of res.data.messages ?? []) {
      if (m.id) messageIdSet.add(m.id);
    }
  }

  logger.info(`Found ${messageIdSet.size} candidate message(s) to check`);

  let ingested = 0;
  let skipped  = 0;

  for (const messageId of messageIdSet) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const msg    = msgRes.data;
      const body   = extractBody(msg.payload ?? undefined);

      const complaintIdMatch    = body.match(/complaint\s+id\s*:\s*([^\s\n\r,]+)/i);
      const requestIdMatch      = body.match(/request\s+id\s*:\s*([^\s\n\r,]+)/i);
      const responseOriginMatch = body.match(/(?:reply\s+origin|responder)\s*:\s*([^\s\n\r,]+)/i);

      if (!complaintIdMatch && !requestIdMatch) {
        logger.debug(`Message ${messageId}: no IDs found — skipping`);
        skipped++;
        continue;
      }

      const caseId         = complaintIdMatch?.[1]?.trim();
      const requestId      = requestIdMatch?.[1]?.trim();
      const responseOrigin = responseOriginMatch?.[1]?.trim().toLowerCase();
      const isCitizen      = responseOrigin === 'complainant' || responseOrigin === 'citizen';
      const sender         = isCitizen ? 'citizen' : 'department';

      logger.info(`Message ${messageId}: caseId=${caseId}, requestId=${requestId}, origin=${responseOrigin}`);

      if (!requestId) { logger.warn(`No requestId in message ${messageId}, skipping`); skipped++; continue; }

      // Check if already processed
      const existingRequest = await DepartmentRequest.findOne({ request_id: requestId });
      if (!existingRequest) { logger.warn(`No DepartmentRequest for ${requestId} — skipping`); skipped++; continue; }
      if (existingRequest.status !== 'sent') { logger.info(`Request ${requestId} already processed — skipping`); skipped++; continue; }

      const resolvedCaseId = existingRequest.case_id?.toString() ?? caseId ?? '';
      if (!resolvedCaseId) { logger.error(`Cannot resolve caseId for ${requestId}`); skipped++; continue; }

      // Download attachments
      const uploadedAttachments: Array<{ filename: string; mimeType: string; secureUrl: string; publicId: string }> = [];
      for (const part of collectAttachments(msg.payload ?? undefined)) {
        try {
          const attRes = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: part.attachmentId });
          if (!attRes.data.data) continue;
          const buffer = Buffer.from(attRes.data.data, 'base64');
          const { secureUrl, publicId } = await uploadToCloudinary(buffer, part.mimeType, resolvedCaseId);
          uploadedAttachments.push({ filename: part.filename, mimeType: part.mimeType, secureUrl, publicId });
          logger.info(`Uploaded attachment: ${part.filename}`);
        } catch (e: any) {
          logger.error(`Failed to upload attachment ${part.filename}: ${e.message}`);
        }
      }

      await ingest({
        caseId: resolvedCaseId, requestId,
        departmentEntityId: existingRequest.department_entity_id ?? (isCitizen ? 'Complainant' : 'unknown'),
        responseContent: body, attachments: uploadedAttachments, sender,
      });
      ingested++;
    } catch (e: any) {
      logger.error(`Error processing message ${messageId}: ${e.message}`);
    }
  }

  logger.info(`Done. Ingested: ${ingested}, Skipped: ${skipped}`);
  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  logger.error('Script failed', { error: err.message });
  process.exit(1);
});
