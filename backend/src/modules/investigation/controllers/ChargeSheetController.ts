import { Request, Response } from 'express';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendError, sendSuccess } from '../../../shared/utils/response.util';
import { ChargeSheetService } from '../services/chargeSheetService';
import { ChargeSheetGenerator } from '../services/ChargeSheetGenerator';
import { generateChargeSheetPdfStream } from '../../../shared/utils/chargeSheetPdfGenerator';

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
  static async regenerateChargeSheet(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const officerId = req.user?.sub || 'SYSTEM'; // Fallback if user ID is missing
      
      const newChargeSheet = await ChargeSheetGenerator.generateForCase(id, officerId);
      
      sendSuccess(res, HttpStatusCode.OK, 'Charge sheet regenerated successfully', newChargeSheet);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'CHARGESHEET_REGENERATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to regenerate charge sheet',
      });
    }
  }

  static async downloadChargeSheetPdf(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const chargeSheetData = await ChargeSheetService.getByCaseId(id);

      if (!chargeSheetData) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'No charge sheet found for this case',
        });
        return;
      }

      await generateChargeSheetPdfStream(chargeSheetData, res);
    } catch (error) {
      if (!res.headersSent) {
        sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
          code: 'CHARGESHEET_PDF_FAILED',
          message: error instanceof Error ? error.message : 'Failed to generate charge sheet PDF',
        });
      }
    }
  }
}