import { Request, Response } from 'express';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendError, sendSuccess } from '../../../shared/utils/response.util';
import { ChargeSheetService } from '../services/chargeSheetService';
import { ChargeSheetGenerator } from '../services/ChargeSheetGenerator';
import { generateChargeSheetPdfStream } from '../../../shared/utils/chargeSheetPdfGenerator';
import logger from '../../../config/logger';

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
    const { id } = req.params;
    logger.info('Charge sheet PDF download requested', { caseId: id });
    try {
      const chargeSheetData = await ChargeSheetService.getByCaseId(id);

      if (!chargeSheetData) {
        logger.warn('Charge sheet PDF download failed: charge sheet not found', { caseId: id });
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'NOT_FOUND',
          message: 'No charge sheet found for this case',
        });
        return;
      }

      await generateChargeSheetPdfStream(chargeSheetData, res);
      logger.info('Charge sheet PDF download generated', {
        caseId: id,
        firNumber: chargeSheetData.section1_filingInformation?.firNumber,
      });
    } catch (error) {
      logger.error('Charge sheet PDF download failed', {
        caseId: id,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (!res.headersSent) {
        sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
          code: 'CHARGESHEET_PDF_FAILED',
          message: error instanceof Error ? error.message : 'Failed to generate charge sheet PDF',
        });
      }
    }
  }

  static async generateChargeSheetPdf(req: Request, res: Response): Promise<void> {
    try {
      const { chargeSheet } = req.body;
      if (!chargeSheet || typeof chargeSheet !== 'object') {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_PAYLOAD',
          message: 'Charge sheet data is required to generate the PDF',
        });
        return;
      }

      if (!chargeSheet.section1_filingInformation?.magistrate?.trim()) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'MAGISTRATE_REQUIRED',
          message: 'Magistrate is required before generating a charge sheet PDF',
        });
        return;
      }

      if (!chargeSheet.section1_filingInformation?.court?.trim()) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'COURT_REQUIRED',
          message: 'Court is required before generating a charge sheet PDF',
        });
        return;
      }

      await generateChargeSheetPdfStream(chargeSheet, res);
    } catch (error) {
      if (!res.headersSent) {
        sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
          code: 'CHARGESHEET_PDF_PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'Failed to generate preview charge sheet PDF',
        });
      }
    }
  }
}