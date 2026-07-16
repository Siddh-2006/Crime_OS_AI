import { Request, Response, NextFunction } from 'express';
import { BaseError } from '../errors/BaseError';
import { ValidationError } from '../errors/ValidationError';
import { HttpStatusCode } from '../enums/httpStatus.enum';
import logger from '../../config/logger';
import env from '../../config/env';
import { sendError } from '../../shared/utils/response.util';

/**
 * Centralized Express error handling middleware.
 * Must be registered LAST in the middleware chain.
 * Hides internal details from the client in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  if (err instanceof BaseError) {
    logger.warn('Operational error', {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      ...(err instanceof ValidationError && { details: err.details }),
    });

    const responsePayload: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };

    if (err instanceof ValidationError && err.details) {
      responsePayload['details'] = err.details;
    }

    sendError(res, err.statusCode, responsePayload);
    return;
  }

  // Unknown / programming errors
  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: err.stack,
  });

  const message =
    env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again later.'
      : err.message;

  sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
    code: 'INTERNAL_SERVER_ERROR',
    message,
  });
}
