/**
 * warrantService.ts
 *
 * Core business logic for the Custody & Arrest Warrant feature.
 * Owns all state transitions, PDF generation, email dispatch, and diary logging.
 *
 * State machine (single source of truth → WARRANT_TRANSITIONS in ArrestWarrant.model.ts):
 *   draft → sent_to_magistrate → approved | rejected
 *   approved → in_custody → produced_before_court | released
 */

import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import logger from '../../../config/logger';
import cloudinary from '../../../config/cloudinary';

import {
  ArrestWarrant,
  IArrestWarrant,
  WarrantStatus,
  WARRANT_ACTIVE_STATUSES,
  WARRANT_TRANSITIONS,
} from '../models/ArrestWarrant.model';
import { DiaryEntry }        from '../models/DiaryEntry.model';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { RequestThread }     from '../models/RequestThread.model';
import { CaseParticipant }   from '../models/CaseParticipant.model';
import { Complaint }         from '../../complaint/models/Complaint.model';
import { DepartmentRegistry } from '../../admin/models/DepartmentRegistry.model';

import { buildWarrantDraftContent } from './warrantTemplateService';
import { generateWarrantPdfBuffer } from './warrantPdfService';
import { EmailQueue }        from '../../../shared/queue/EmailQueue';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAGISTRATE_ENTITY_ID = 'court_magistrate_office';
const WARRANT_STEP_ID      = 'arrest_warrant';      // synthetic checklist step id

/** Keywords that signal magistrate approval in the reply body (case-insensitive). */
const APPROVAL_KEYWORDS  = ['approved', 'sanctioned', 'granted', 'signed', 'order issued', 'warrant issued'];
/** Keywords that signal magistrate rejection in the reply body (case-insensitive). */
const REJECTION_KEYWORDS = ['rejected', 'refused', 'denied', 'not granted', 'dismissed', 'declined'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Guards a state transition.
 * Throws a descriptive 422-style error if the transition is invalid.
 */
function assertTransition(current: WarrantStatus, next: WarrantStatus): void {
  const allowed = WARRANT_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    const err: any = new Error(
      `Invalid warrant transition: '${current}' → '${next}'. ` +
      `Allowed next states from '${current}': [${allowed.join(', ') || 'none — terminal state'}].`,
    );
    err.statusCode = 422;
    err.current    = current;
    err.attempted  = next;
    throw err;
  }
}

/**
 * Creates a DiaryEntry for a warrant lifecycle event.
 * All warrant diary entries share the same shape.
 */
async function writeDiaryEntry(opts: {
  caseId: string | Types.ObjectId;
  warrantId: string;
  participantId: string;
  participantName: string;
  eventType: string;
  actorType: 'officer' | 'system' | 'department';
  actorId: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  await DiaryEntry.create({
    case_id:    opts.caseId,
    entry_id:   uuidv4(),
    actor:      { type: opts.actorType, id: opts.actorId },
    event_type: opts.eventType,
    payload: {
      warrant_id:       opts.warrantId,
      participant_id:   opts.participantId,
      participant_name: opts.participantName,
      ...opts.extra,
    },
    ref_ids: {
      warrant_id:     opts.warrantId,
      participant_id: opts.participantId,
    },
  });
}

// ─── WarrantService ───────────────────────────────────────────────────────────

export class WarrantService {

  // ── 1. Create draft ─────────────────────────────────────────────────────────

  /**
   * Creates a new ArrestWarrant in 'draft' status.
   * Fetches case + participant data automatically — IO only needs to provide justification.
   *
   * @throws 400  if the complaint has no FIR number registered.
   * @throws 404  if the complaint or participant is not found.
   * @throws 409  if an active warrant already exists for this participant.
   */
  static async createDraft(opts: {
    caseId: string;
    participantId: string;
    justification: string;
    warrantDraftContent?: string;   // optional override — generated from template if omitted
    officerName?: string;
    officerRank?: string;
  }): Promise<IArrestWarrant> {
    const { caseId, participantId, justification } = opts;
    logger.info(`[WarrantService] createDraft — case: ${caseId}, participant: ${participantId}`);

    // Validate justification
    if (!justification || justification.trim().length < 10) {
      const err: any = new Error('Justification must be at least 10 characters.');
      err.statusCode = 400;
      throw err;
    }

    // Enforce one active warrant per participant
    const existing = await ArrestWarrant.findOne({
      participant_id: participantId,
      status: { $in: WARRANT_ACTIVE_STATUSES },
    });
    if (existing) {
      const err: any = new Error(
        `An active arrest warrant (status: '${existing.status}') already exists ` +
        `for participant '${participantId}'. Only one active warrant is allowed at a time.`,
      );
      err.statusCode = 409;
      err.existingWarrantId = existing.warrant_id;
      throw err;
    }

    // Load complaint (populate policeStation for name/district)
    const complaint = await Complaint.findById(caseId)
      .populate('policeStation', 'name district city state')
      .lean();
    if (!complaint) {
      const err: any = new Error(`Complaint '${caseId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    if (!complaint.firNumber) {
      const err: any = new Error(
        'A FIR number must be registered before drafting an arrest warrant. ' +
        'Please register the FIR first.',
      );
      err.statusCode = 400;
      throw err;
    }

    // Load participant
    const participant = await CaseParticipant.findOne({
      case_id: new Types.ObjectId(caseId),
      participant_id: participantId,
    }).lean();
    if (!participant) {
      const err: any = new Error(`Participant '${participantId}' not found in case '${caseId}'.`);
      err.statusCode = 404;
      throw err;
    }

    const station    = (complaint.policeStation as any) ?? {};
    const policeStation = station.name     || 'Unknown Police Station';
    const district      = station.district || station.city || 'Unknown District';

    // Applied sections: accused takes precedence over suspect
    const appliedSections =
      (participant.accusedProfile?.appliedSections?.length
        ? participant.accusedProfile.appliedSections
        : participant.suspectProfile?.appliedSections) ?? [];

    const identifiers = (participant.identifiers ?? []).map((id) => ({
      type:  id.type,
      value: id.value,
    }));

    // Generate BNSS Form No. 2 text unless IO provided an override
    const warrantDraftContent = opts.warrantDraftContent?.trim() || buildWarrantDraftContent({
      officerName:       opts.officerName   || 'Investigating Officer',
      officerRank:       opts.officerRank   || 'P.I.',
      policeStation,
      district,
      accusedName:       participant.name   || 'Unknown',
      accusedAddress:    participant.contact?.address,
      accusedIdentifiers: identifiers,
      appliedSections:   appliedSections.map((s: any) => ({
        code:   s.code,
        title:  s.title,
        reason: s.reason,
      })),
      firNumber:         complaint.firNumber,
      justification:     justification.trim(),
    });

    const warrant = await ArrestWarrant.create({
      warrant_id:             uuidv4(),
      case_id:                new Types.ObjectId(caseId),
      participant_id:         participantId,
      status:                 'draft',
      fir_number:             complaint.firNumber,
      police_station:         policeStation,
      district,
      accused_name:           participant.name || 'Unknown',
      accused_address:        participant.contact?.address,
      accused_identifiers:    identifiers,
      applied_sections:       appliedSections.map((s: any) => ({
        code:   s.code,
        title:  s.title,
        reason: s.reason,
      })),
      justification:          justification.trim(),
      warrant_draft_content:  warrantDraftContent,
      magistrate_approval_status: 'pending',
    });

    await writeDiaryEntry({
      caseId,
      warrantId:       warrant.warrant_id,
      participantId,
      participantName: participant.name || 'Unknown',
      eventType:       'warrant_drafted',
      actorType:       'officer',
      actorId:         'io',
    });

    logger.info(`[WarrantService] Draft created — warrant_id: ${warrant.warrant_id}`);
    return warrant;
  }

  // ── 2. Update draft fields ──────────────────────────────────────────────────

  /**
   * Updates editable fields on a draft warrant.
   * Only allowed while status === 'draft'. All other fields are ignored.
   *
   * @throws 404  if the warrant is not found.
   * @throws 422  if the warrant is not in 'draft' status.
   */
  static async updateDraft(
    warrantId: string,
    patch: { justification?: string; warrantDraftContent?: string },
  ): Promise<IArrestWarrant> {
    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId });
    if (!warrant) {
      const err: any = new Error(`ArrestWarrant '${warrantId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    if (warrant.status !== 'draft') {
      const err: any = new Error(
        `Only draft warrants can be edited. Current status: '${warrant.status}'.`,
      );
      err.statusCode = 422;
      throw err;
    }

    if (patch.justification !== undefined) {
      if (patch.justification.trim().length < 10) {
        const err: any = new Error('Justification must be at least 10 characters.');
        err.statusCode = 400;
        throw err;
      }
      warrant.justification = patch.justification.trim();
    }
    if (patch.warrantDraftContent !== undefined) {
      warrant.warrant_draft_content = patch.warrantDraftContent.trim();
    }

    await warrant.save();
    logger.info(`[WarrantService] Draft updated — warrant_id: ${warrantId}`);
    return warrant;
  }

  // ── 3. Send to magistrate ───────────────────────────────────────────────────

  /**
   * Transitions draft → sent_to_magistrate.
   *
   * Steps:
   *  1. Generate PDF from warrant_draft_content (source of truth).
   *  2. Look up magistrate contact_email from DepartmentRegistry.
   *  3. Create DepartmentRequest + RequestThread (reusing existing pattern).
   *  4. Enqueue email with PDF attachment via EmailQueue.
   *  5. Update warrant status + set sent_at.
   *  6. Write DiaryEntry.
   *
   * If email dispatch fails the warrant is rolled back to 'draft' and a 502 is thrown.
   *
   * @throws 404  warrant not found.
   * @throws 422  invalid state transition.
   * @throws 502  email send failure (magistrate email missing or queue error).
   */
  static async sendToMagistrate(
    warrantId: string,
    officerId: string,
  ): Promise<IArrestWarrant> {
    logger.info(`[WarrantService] sendToMagistrate — warrant: ${warrantId}`);

    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId });
    if (!warrant) {
      const err: any = new Error(`ArrestWarrant '${warrantId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    assertTransition(warrant.status, 'sent_to_magistrate');

    // 1. Generate PDF buffer
    const pdfBuffer = await generateWarrantPdfBuffer(warrant);

    // 2. Look up magistrate contact email
    const magistrateReg = await DepartmentRegistry.findOne({
      entity_id: MAGISTRATE_ENTITY_ID,
    }).lean();
    const magistrateEmail = (magistrateReg as any)?.contact_email as string | undefined;
    if (!magistrateEmail) {
      const err: any = new Error(
        `No contact_email found in DepartmentRegistry for '${MAGISTRATE_ENTITY_ID}'. ` +
        `Please update the magistrate registry entry with a valid email.`,
      );
      err.statusCode = 502;
      throw err;
    }

    // 3. Create DepartmentRequest (reuses existing email tracking pattern)
    const requestId = uuidv4();
    const emailBody = [
      `Complaint ID: ${warrant.case_id}`,
      `Request ID: ${requestId}`,
      `Reply Origin: department`,
      ``,
      `Honourable Magistrate,`,
      ``,
      `Please find the attached Warrant of Arrest (BNSS Form No. 2) for your review and signature.`,
      ``,
      `FIR No.       : ${warrant.fir_number}`,
      `Police Station: ${warrant.police_station}, ${warrant.district}`,
      `Accused       : ${warrant.accused_name}`,
      `Warrant ID    : ${warrant.warrant_id}`,
      ``,
      `Kindly reply to this email with your decision:`,
      `  • To APPROVE : Reply with "Approved" and attach the signed warrant PDF.`,
      `  • To REJECT  : Reply with "Rejected" and state the reason.`,
      ``,
      `Sincerely,`,
      `${warrant.police_station} Police Station, ${warrant.district}`,
    ].join('\n');

    await DepartmentRequest.create({
      case_id:              warrant.case_id,
      request_id:           requestId,
      step_id:              WARRANT_STEP_ID,
      request_type:         'external_department',
      recipient_type:       'magistrate',
      department_entity_id: MAGISTRATE_ENTITY_ID,
      draft_content:        emailBody,
      attachments:          [],
      status:               'sent',
      sent_via:             'email',
      sent_at:              new Date(),
    });

    // 4. Create RequestThread with initial IO message
    await RequestThread.create({
      case_id:              warrant.case_id,
      request_id:           requestId,
      department_entity_id: MAGISTRATE_ENTITY_ID,
      step_title:           `Arrest Warrant — ${warrant.accused_name} (${warrant.fir_number})`,
      request_type:         'external_department',
      recipient_type:       'magistrate',
      unread_by_io:         false,
      messages: [{
        sender:      'io',
        content:     warrant.warrant_draft_content,
        timestamp:   new Date(),
        attachments: [],
      }],
    });

    // 5. Enqueue email with PDF attachment
    // EmailQueue.enqueueDepartmentRequest picks up contact_email from registry
    // but doesn't support raw Buffer attachments — we pass the PDF via the
    // DepartmentRequestEmailPayload attachments field as a base64 data URI
    // so EmailWorker can attach it directly.
    const pdfBase64 = pdfBuffer.toString('base64');
    const pdfDataUri = `data:application/pdf;base64,${pdfBase64}`;

    try {
      await EmailQueue.enqueueDepartmentRequest({
        to:             magistrateEmail,
        departmentName: magistrateReg?.entity_name ?? 'Court / Magistrate Office',
        caseId:         warrant.case_id.toString(),
        requestId,
        content:        emailBody,
        attachments: [{
          filename: `ArrestWarrant_${warrant.fir_number}_${warrant.accused_name.replace(/\s+/g, '_')}.pdf`,
          url:      pdfDataUri,
        }],
      });
    } catch (sendErr: any) {
      // Roll back: delete the DepartmentRequest + thread we just created
      logger.error(`[WarrantService] Email queue failed for warrant ${warrantId}`, {
        error: sendErr.message,
      });
      await DepartmentRequest.deleteOne({ request_id: requestId });
      await RequestThread.deleteOne({ request_id: requestId });
      const err: any = new Error(
        `Failed to dispatch warrant email to magistrate: ${sendErr.message}`,
      );
      err.statusCode = 502;
      throw err;
    }

    // 6. Update warrant
    warrant.status                      = 'sent_to_magistrate';
    warrant.sent_at                     = new Date();
    warrant.related_department_request_id = requestId;
    await warrant.save();

    // 7. DiaryEntry
    await writeDiaryEntry({
      caseId:          warrant.case_id.toString(),
      warrantId:       warrant.warrant_id,
      participantId:   warrant.participant_id,
      participantName: warrant.accused_name,
      eventType:       'warrant_sent_to_magistrate',
      actorType:       'officer',
      actorId:         officerId,
      extra: { sent_at: warrant.sent_at, magistrate_email: magistrateEmail, request_id: requestId },
    });

    logger.info(`[WarrantService] Warrant sent to magistrate — warrant_id: ${warrantId}, request_id: ${requestId}`);
    return warrant;
  }

  // ── 4. Process magistrate reply (called by GmailPollWorker hook) ────────────

  /**
   * Parses the magistrate's email reply and transitions the warrant to
   * 'approved' or 'rejected'. If neither keyword set is found, appends
   * the reply to the RequestThread for the IO to review manually.
   *
   * Also stores the signed warrant PDF (if approved + attached) to Cloudinary.
   *
   * @param requestId   - DepartmentRequest.request_id embedded in the email body.
   * @param emailBody   - Plain-text body of the magistrate's reply.
   * @param pdfBuffer   - Optional Buffer of the signed PDF attachment.
   */
  static async processMagistrateReply(
    requestId: string,
    emailBody: string,
    pdfBuffer?: Buffer,
  ): Promise<void> {
    logger.info(`[WarrantService] processMagistrateReply — request_id: ${requestId}`);

    const warrant = await ArrestWarrant.findOne({
      related_department_request_id: requestId,
      status: 'sent_to_magistrate',
    });
    if (!warrant) {
      logger.warn(
        `[WarrantService] No 'sent_to_magistrate' warrant found for request_id: ${requestId}. ` +
        `Reply appended to thread only.`,
      );
      // Still append reply to thread for IO visibility
      await WarrantService._appendToThread(requestId, emailBody);
      return;
    }

    const bodyLower = emailBody.toLowerCase();
    const isApproval  = APPROVAL_KEYWORDS.some((kw) => bodyLower.includes(kw));
    const isRejection = REJECTION_KEYWORDS.some((kw) => bodyLower.includes(kw));

    if (!isApproval && !isRejection) {
      // Ambiguous reply — let IO decide
      logger.warn(
        `[WarrantService] Magistrate reply for warrant ${warrant.warrant_id} contains no ` +
        `approval/rejection keyword. Appending to thread for manual IO review.`,
      );
      await WarrantService._appendToThread(requestId, emailBody);
      return;
    }

    const now = new Date();

    if (isApproval) {
      // Upload signed PDF to Cloudinary if provided
      let signedPdfUrl: string | undefined;
      if (pdfBuffer && pdfBuffer.length > 0) {
        try {
          signedPdfUrl = await WarrantService._uploadSignedPdf(
            pdfBuffer,
            warrant.warrant_id,
          );
          logger.info(`[WarrantService] Signed PDF uploaded — url: ${signedPdfUrl}`);
        } catch (uploadErr: any) {
          logger.error(`[WarrantService] Signed PDF upload failed`, { error: uploadErr.message });
          // Non-fatal — approval still proceeds without the PDF URL
        }
      }

      warrant.status                     = 'approved';
      warrant.magistrate_approval_status = 'approved';
      warrant.magistrate_response_at     = now;
      if (signedPdfUrl) warrant.signed_warrant_pdf_url = signedPdfUrl;
      await warrant.save();

      await writeDiaryEntry({
        caseId:          warrant.case_id.toString(),
        warrantId:       warrant.warrant_id,
        participantId:   warrant.participant_id,
        participantName: warrant.accused_name,
        eventType:       'warrant_approved',
        actorType:       'department',
        actorId:         MAGISTRATE_ENTITY_ID,
        extra: {
          magistrate_response_at: now,
          signed_pdf_url:         signedPdfUrl,
        },
      });

      logger.info(`[WarrantService] Warrant APPROVED — warrant_id: ${warrant.warrant_id}`);

    } else {
      // Rejection
      const rejectionReason = emailBody.slice(0, 1000).trim();

      warrant.status                     = 'rejected';
      warrant.magistrate_approval_status = 'rejected';
      warrant.magistrate_response_at     = now;
      warrant.magistrate_rejection_reason = rejectionReason;
      await warrant.save();

      await writeDiaryEntry({
        caseId:          warrant.case_id.toString(),
        warrantId:       warrant.warrant_id,
        participantId:   warrant.participant_id,
        participantName: warrant.accused_name,
        eventType:       'warrant_rejected',
        actorType:       'department',
        actorId:         MAGISTRATE_ENTITY_ID,
        extra: {
          magistrate_response_at: now,
          rejection_reason:       rejectionReason,
        },
      });

      logger.info(`[WarrantService] Warrant REJECTED — warrant_id: ${warrant.warrant_id}`);
    }

    // Append the reply body to the RequestThread for the IO's audit trail
    await WarrantService._appendToThread(requestId, emailBody);
  }

  /** Uploads a Buffer to Cloudinary and returns the secure URL. */
  private static async _uploadSignedPdf(
    buffer: Buffer,
    warrantId: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder:        'warrants/signed',
          public_id:     `warrant_signed_${warrantId}`,
          format:        'pdf',
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload returned no result'));
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }

  /** Appends a message to the magistrate's RequestThread. */
  private static async _appendToThread(requestId: string, content: string): Promise<void> {
    const thread = await RequestThread.findOne({ request_id: requestId });
    if (thread) {
      thread.messages.push({
        sender:      'department',
        content,
        timestamp:   new Date(),
        attachments: [],
      });
      thread.unread_by_io = true;
      await thread.save();
    }
  }

  // ── 5. Take into custody ────────────────────────────────────────────────────

  /**
   * Transitions approved → in_custody.
   * Sets arrested_at = now, custody_deadline = now + 24 h.
   * Enqueues a BullMQ delayed CustodyTimerJob that fires at the deadline.
   *
   * @throws 404  warrant not found.
   * @throws 422  invalid state transition.
   */
  static async takeIntoCustody(warrantId: string): Promise<IArrestWarrant> {
    logger.info(`[WarrantService] takeIntoCustody — warrant: ${warrantId}`);

    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId });
    if (!warrant) {
      const err: any = new Error(`ArrestWarrant '${warrantId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    assertTransition(warrant.status, 'in_custody');

    const now              = new Date();
    const custodyDeadline  = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 h

    warrant.status           = 'in_custody';
    warrant.arrested_at      = now;
    warrant.custody_deadline = custodyDeadline;
    await warrant.save();

    // Enqueue the 24-hour deadline BullMQ job
    // Import lazily to avoid circular deps (CustodyTimerQueue imports this service)
    try {
      const { CustodyTimerQueue } = await import('../../../shared/queue/CustodyTimerQueue');
      await CustodyTimerQueue.enqueue({
        caseId:          warrant.case_id.toString(),
        warrantId:       warrant.warrant_id,
        participantId:   warrant.participant_id,
        participantName: warrant.accused_name,
        custodyDeadline: custodyDeadline.toISOString(),
      });
    } catch (qErr: any) {
      // Non-fatal: deadline timer won't fire, but custody is already recorded
      logger.error(`[WarrantService] CustodyTimerQueue enqueue failed`, { error: qErr.message });
    }

    await writeDiaryEntry({
      caseId:          warrant.case_id.toString(),
      warrantId:       warrant.warrant_id,
      participantId:   warrant.participant_id,
      participantName: warrant.accused_name,
      eventType:       'suspect_taken_into_custody',
      actorType:       'officer',
      actorId:         'io',
      extra: { arrested_at: now, custody_deadline: custodyDeadline },
    });

    logger.info(
      `[WarrantService] In custody — warrant: ${warrantId}, ` +
      `deadline: ${custodyDeadline.toISOString()}`,
    );
    return warrant;
  }

  // ── 6. Produce before court ─────────────────────────────────────────────────

  /**
   * Transitions in_custody → produced_before_court.
   *
   * @throws 404  warrant not found.
   * @throws 422  invalid state transition.
   */
  static async produceBeforeCourt(warrantId: string): Promise<IArrestWarrant> {
    logger.info(`[WarrantService] produceBeforeCourt — warrant: ${warrantId}`);

    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId });
    if (!warrant) {
      const err: any = new Error(`ArrestWarrant '${warrantId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    assertTransition(warrant.status, 'produced_before_court');

    const now = new Date();
    warrant.status                    = 'produced_before_court';
    warrant.produced_before_court_at  = now;
    await warrant.save();

    await writeDiaryEntry({
      caseId:          warrant.case_id.toString(),
      warrantId:       warrant.warrant_id,
      participantId:   warrant.participant_id,
      participantName: warrant.accused_name,
      eventType:       'accused_produced_before_court',
      actorType:       'officer',
      actorId:         'io',
      extra: { produced_before_court_at: now },
    });

    logger.info(`[WarrantService] Produced before court — warrant: ${warrantId}`);
    return warrant;
  }

  // ── 7. Mark released ────────────────────────────────────────────────────────

  /**
   * Transitions in_custody → released.
   *
   * @throws 404  warrant not found.
   * @throws 422  invalid state transition.
   */
  static async markReleased(warrantId: string): Promise<IArrestWarrant> {
    logger.info(`[WarrantService] markReleased — warrant: ${warrantId}`);

    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId });
    if (!warrant) {
      const err: any = new Error(`ArrestWarrant '${warrantId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    assertTransition(warrant.status, 'released');

    warrant.status = 'released';
    await warrant.save();

    await writeDiaryEntry({
      caseId:          warrant.case_id.toString(),
      warrantId:       warrant.warrant_id,
      participantId:   warrant.participant_id,
      participantName: warrant.accused_name,
      eventType:       'suspect_released',
      actorType:       'officer',
      actorId:         'io',
    });

    logger.info(`[WarrantService] Released — warrant: ${warrantId}`);
    return warrant;
  }

  // ── 8. Handle custody deadline (called by CustodyTimerWorker) ──────────────

  /**
   * Fires when the BullMQ CustodyTimerJob reaches its delay.
   * Writes a DiaryEntry — status stays 'in_custody' until IO acts.
   */
  static async handleCustodyDeadline(warrantId: string): Promise<void> {
    logger.info(`[WarrantService] handleCustodyDeadline — warrant: ${warrantId}`);

    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId }).lean();
    if (!warrant) {
      logger.warn(`[WarrantService] Warrant ${warrantId} not found at deadline — may have already been resolved.`);
      return;
    }
    if (warrant.status !== 'in_custody') {
      logger.debug(`[WarrantService] Warrant ${warrantId} is no longer in_custody (status: ${warrant.status}). Skipping deadline entry.`);
      return;
    }

    await writeDiaryEntry({
      caseId:          warrant.case_id.toString(),
      warrantId:       warrant.warrant_id,
      participantId:   warrant.participant_id,
      participantName: warrant.accused_name,
      eventType:       'custody_deadline_reached',
      actorType:       'system',
      actorId:         'custody-timer',
      extra: {
        custody_deadline: warrant.custody_deadline,
        arrested_at:      warrant.arrested_at,
      },
    });

    logger.info(`[WarrantService] Custody deadline diary entry written — warrant: ${warrantId}`);
  }

  // ── 9. Query helpers ────────────────────────────────────────────────────────

  /**
   * Returns all warrants for a case, ordered newest-first.
   * Optionally filtered to a single participant.
   */
  static async getWarrantsForCase(
    caseId: string,
    participantId?: string,
  ): Promise<IArrestWarrant[]> {
    const filter: Record<string, unknown> = {
      case_id: new Types.ObjectId(caseId),
    };
    if (participantId) filter.participant_id = participantId;

    return ArrestWarrant.find(filter).sort({ createdAt: -1 }).lean() as Promise<IArrestWarrant[]>;
  }

  /**
   * Returns a single warrant by warrant_id.
   *
   * @throws 404 if not found.
   */
  static async getWarrantById(warrantId: string): Promise<IArrestWarrant> {
    const warrant = await ArrestWarrant.findOne({ warrant_id: warrantId }).lean();
    if (!warrant) {
      const err: any = new Error(`ArrestWarrant '${warrantId}' not found.`);
      err.statusCode = 404;
      throw err;
    }
    return warrant as IArrestWarrant;
  }
}
