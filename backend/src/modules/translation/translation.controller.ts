import { NextFunction, Request, Response } from 'express';
import { HttpStatusCode } from '../../common/enums/httpStatus.enum';
import { sendSuccess } from '../../shared/utils/response.util';
import logger from '../../config/logger';
import { translationService } from './translation.service';
import { isSupportedLanguage } from './types';

const MAX_BATCH_SIZE = 100;
const MAX_TEXT_LENGTH = 2000;

export async function translateBatch(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { texts, sourceLanguage, targetLanguage } = req.body as {
      texts?: unknown;
      sourceLanguage?: unknown;
      targetLanguage?: unknown;
    };

    if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string')) {
      res.status(HttpStatusCode.BAD_REQUEST).json({
        success: false,
        message: 'texts must be an array of strings',
      });
      return;
    }

    if (texts.length > MAX_BATCH_SIZE) {
      res.status(HttpStatusCode.BAD_REQUEST).json({
        success: false,
        message: `texts cannot contain more than ${MAX_BATCH_SIZE} items`,
      });
      return;
    }

    if (texts.some((text) => text.length > MAX_TEXT_LENGTH)) {
      res.status(HttpStatusCode.BAD_REQUEST).json({
        success: false,
        message: `each text must be ${MAX_TEXT_LENGTH} characters or less`,
      });
      return;
    }

    if (!isSupportedLanguage(sourceLanguage) || !isSupportedLanguage(targetLanguage)) {
      res.status(HttpStatusCode.BAD_REQUEST).json({
        success: false,
        message: 'sourceLanguage and targetLanguage must be one of en, hi, gu',
      });
      return;
    }

    logger.info('[translation] incoming translation request', {
      sourceLanguage,
      targetLanguage,
      textCount: texts.length,
      userId: (req as any).user?.id,
    });

    const translations = await translationService.translateBatch({
      texts,
      sourceLanguage,
      targetLanguage,
    });

    sendSuccess(res, HttpStatusCode.OK, 'Translations resolved', { translations });
  } catch (error) {
    next(error);
  }
}
