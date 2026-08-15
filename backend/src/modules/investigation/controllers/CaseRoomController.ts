import { Request, Response } from 'express';
import { CaseRoomService } from '../services/caseRoomService';
import { Officer } from '../../police/models/Officer.model';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';

export class CaseRoomController {
  static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      const result = await CaseRoomService.getMessages(id, page, limit);
      sendSuccess(res, HttpStatusCode.OK, 'Case room messages retrieved', result);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'MESSAGES_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch room messages',
      });
    }
  }

  static async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const officerId = req.user?.sub;

      if (!content || !officerId) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'content is required',
        });
        return;
      }

      let officerName = (req.user as any)?.officerName;
      if (!officerName) {
        const officer = await Officer.findById(officerId).select('officerName').lean();
        officerName = officer?.officerName || 'Officer';
      }

      const message = await CaseRoomService.saveMessage(id, officerId, officerName, content);
      sendSuccess(res, HttpStatusCode.CREATED, 'Message sent successfully', message);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'MESSAGE_SEND_FAILED',
        message: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  }

  static async getEligibility(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const eligibility = await CaseRoomService.isRoomEligible(id);
      sendSuccess(res, HttpStatusCode.OK, 'Room eligibility status', eligibility);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'ELIGIBILITY_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Failed to check eligibility',
      });
    }
  }
}
