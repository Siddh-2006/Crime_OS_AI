import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique correlation ID to every incoming request.
 * This ID propagates through logs to trace a full request lifecycle.
 */
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string) || uuidv4();
  next();
}
