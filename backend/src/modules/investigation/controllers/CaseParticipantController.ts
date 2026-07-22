import { Request, Response } from 'express';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendError, sendSuccess } from '../../../shared/utils/response.util';
import { CaseParticipantService } from '../services/caseParticipantService';

export class CaseParticipantController {
  static async listCaseParticipants(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const participants = await CaseParticipantService.listByCaseId(id);
      sendSuccess(res, HttpStatusCode.OK, 'Fetched case participants', participants);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANTS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch case participants',
      });
    }
  }

  static async approveRecommendation(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { recommendation, participant_id, contact, identifiers, victimProfile, witnessProfile, suspectProfile, accusedProfile, complainantProfile, snapshot_id } = req.body;

      if (!recommendation) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'recommendation is required',
        });
        return;
      }

      const participant = await CaseParticipantService.approveRecommendation(id, {
        recommendation,
        participant_id,
        contact,
        identifiers,
        victimProfile,
        witnessProfile,
        suspectProfile,
        accusedProfile,
        complainantProfile,
        snapshot_id,
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Participant recommendation approved', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'PARTICIPANT_APPROVAL_FAILED',
        message: error instanceof Error ? error.message : 'Failed to approve recommendation',
      });
    }
  }

  static async attachSections(req: Request, res: Response): Promise<void> {
    try {
      const { id, participantId } = req.params;
      const { sections } = req.body;
      const attachedByOfficerId = req.user?.sub;

      if (!attachedByOfficerId) {
        sendError(res, HttpStatusCode.UNAUTHORIZED, {
          code: 'UNAUTHORIZED',
          message: 'Authenticated officer context is required',
        });
        return;
      }

      if (!Array.isArray(sections) || sections.length === 0) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'sections is required and must be a non-empty array',
        });
        return;
      }

      const participant = await CaseParticipantService.attachSectionsToParticipant(id, participantId, {
        sections,
        attachedByOfficerId,
      });

      sendSuccess(res, HttpStatusCode.OK, 'Sections attached to participant', participant);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'SECTION_ATTACH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to attach sections',
      });
    }
  }
}