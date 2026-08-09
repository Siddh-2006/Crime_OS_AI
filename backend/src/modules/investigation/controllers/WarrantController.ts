/**
 * WarrantController.ts
 *
 * Express request handlers for the Custody & Arrest Warrant feature.
 * All routes are mounted under /api/v1/cases/:id/warrants (via warrant.routes.ts)
 * and already have authenticate + authorize(SHO, IO) applied by the parent router.
 *
 * Error handling strategy:
 *  - Service errors with a .statusCode property are forwarded as-is.
 *  - All other errors return 500.
 *  - Follows the same sendSuccess / sendError pattern as InvestigationController.
 */

import { Request, Response } from 'express';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { WarrantService } from '../services/warrantService';
import logger from '../../../config/logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the HTTP status code from a service error.
 * Services throw errors with a .statusCode property for domain errors.
 * Falls back to 500 for unexpected errors.
 */
function resolveStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    return Number((err as { statusCode: number }).statusCode);
  }
  return HttpStatusCode.INTERNAL_SERVER_ERROR;
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class WarrantController {

  /**
   * GET /cases/:id/warrants[?participantId=<id>]
   * Lists all warrants for a case, newest first.
   * Optionally filter by participant.
   */
  static async listWarrants(req: Request, res: Response): Promise<void> {
    try {
      const caseId        = req.params.id;
      const participantId = req.query.participantId as string | undefined;

      const warrants = await WarrantService.getWarrantsForCase(caseId, participantId);
      sendSuccess(res, HttpStatusCode.OK, 'Warrants retrieved', warrants);
    } catch (err) {
      logger.error('[WarrantController] listWarrants error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'WARRANT_LIST_FAILED',
        message: err instanceof Error ? err.message : 'Failed to retrieve warrants',
      });
    }
  }

  /**
   * GET /cases/:id/warrants/:warrantId
   * Returns a single warrant by warrant_id.
   */
  static async getWarrant(req: Request, res: Response): Promise<void> {
    try {
      const warrant = await WarrantService.getWarrantById(req.params.warrantId);
      sendSuccess(res, HttpStatusCode.OK, 'Warrant retrieved', warrant);
    } catch (err) {
      logger.error('[WarrantController] getWarrant error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'WARRANT_NOT_FOUND',
        message: err instanceof Error ? err.message : 'Warrant not found',
      });
    }
  }

  /**
   * POST /cases/:id/warrants
   * Creates a new arrest warrant draft.
   *
   * Body: { participant_id, justification, warrant_draft_content? }
   */
  static async createWarrant(req: Request, res: Response): Promise<void> {
    try {
      const caseId = req.params.id;
      const { participant_id, justification, warrant_draft_content } = req.body;

      if (!participant_id || !justification) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code:    'MISSING_FIELDS',
          message: 'participant_id and justification are required.',
        });
        return;
      }

      const officer = (req as any).user;
      const warrant = await WarrantService.createDraft({
        caseId,
        participantId:        participant_id,
        justification,
        warrantDraftContent:  warrant_draft_content,
        officerName:          officer?.name || officer?.officerName || 'Investigating Officer',
        officerRank:          officer?.rank || 'P.I.',
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Arrest warrant draft created', warrant);
    } catch (err) {
      logger.error('[WarrantController] createWarrant error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'WARRANT_CREATE_FAILED',
        message: err instanceof Error ? err.message : 'Failed to create warrant draft',
      });
    }
  }

  /**
   * PATCH /cases/:id/warrants/:warrantId
   * Updates justification and/or warrant_draft_content while still in 'draft' status.
   *
   * Body: { justification?, warrant_draft_content? }
   */
  static async updateWarrant(req: Request, res: Response): Promise<void> {
    try {
      const { justification, warrant_draft_content } = req.body;

      const warrant = await WarrantService.updateDraft(req.params.warrantId, {
        justification,
        warrantDraftContent: warrant_draft_content,
      });

      sendSuccess(res, HttpStatusCode.OK, 'Warrant draft updated', warrant);
    } catch (err) {
      logger.error('[WarrantController] updateWarrant error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'WARRANT_UPDATE_FAILED',
        message: err instanceof Error ? err.message : 'Failed to update warrant draft',
      });
    }
  }

  /**
   * POST /cases/:id/warrants/:warrantId/send
   * Generates the PDF, sends email to magistrate, transitions draft → sent_to_magistrate.
   */
  static async sendToMagistrate(req: Request, res: Response): Promise<void> {
    try {
      const officerId = ((req as any).user?.id || (req as any).user?._id || 'io').toString();
      const warrant   = await WarrantService.sendToMagistrate(req.params.warrantId, officerId);
      sendSuccess(res, HttpStatusCode.OK, 'Warrant sent to magistrate', warrant);
    } catch (err) {
      logger.error('[WarrantController] sendToMagistrate error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'WARRANT_SEND_FAILED',
        message: err instanceof Error ? err.message : 'Failed to send warrant to magistrate',
      });
    }
  }

  /**
   * POST /cases/:id/warrants/:warrantId/custody
   * Marks the accused as arrested, starts 24-hour BNSS §57 timer.
   * Transitions: approved → in_custody.
   */
  static async takeIntoCustody(req: Request, res: Response): Promise<void> {
    try {
      const warrant = await WarrantService.takeIntoCustody(req.params.warrantId);
      sendSuccess(res, HttpStatusCode.OK, 'Accused taken into custody. 24-hour timer started.', warrant);
    } catch (err) {
      logger.error('[WarrantController] takeIntoCustody error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'CUSTODY_FAILED',
        message: err instanceof Error ? err.message : 'Failed to take into custody',
      });
    }
  }

  /**
   * POST /cases/:id/warrants/:warrantId/produced
   * Marks the accused as produced before court.
   * Transitions: in_custody → produced_before_court.
   */
  static async produceBeforeCourt(req: Request, res: Response): Promise<void> {
    try {
      const warrant = await WarrantService.produceBeforeCourt(req.params.warrantId);
      sendSuccess(res, HttpStatusCode.OK, 'Accused marked as produced before court', warrant);
    } catch (err) {
      logger.error('[WarrantController] produceBeforeCourt error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'PRODUCE_FAILED',
        message: err instanceof Error ? err.message : 'Failed to mark produced before court',
      });
    }
  }

  /**
   * POST /cases/:id/warrants/:warrantId/release
   * Marks the accused as released from custody.
   * Transitions: in_custody → released.
   */
  static async markReleased(req: Request, res: Response): Promise<void> {
    try {
      const warrant = await WarrantService.markReleased(req.params.warrantId);
      sendSuccess(res, HttpStatusCode.OK, 'Accused marked as released', warrant);
    } catch (err) {
      logger.error('[WarrantController] markReleased error', { error: err });
      sendError(res, resolveStatus(err), {
        code:    'RELEASE_FAILED',
        message: err instanceof Error ? err.message : 'Failed to mark as released',
      });
    }
  }
}
