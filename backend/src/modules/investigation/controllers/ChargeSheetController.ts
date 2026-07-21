import { Request, Response } from 'express';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendError, sendSuccess } from '../../../shared/utils/response.util';
import { ChargeSheetService } from '../services/chargeSheetService';

export class ChargeSheetController {
  static async getChargeSheet(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const chargeSheet = await ChargeSheetService.getByCaseId(id);

      if (!chargeSheet) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'No charge sheet found for this case',
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Fetched charge sheet', chargeSheet);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'CHARGESHEET_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Failed to fetch charge sheet',
      });
    }
  }
}