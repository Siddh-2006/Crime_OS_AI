import { BaseError } from './BaseError';
import { HttpStatusCode } from '../enums/httpStatus.enum';

export class ValidationError extends BaseError {
  public readonly details: unknown;

  constructor(message: string, details?: unknown) {
    super(message, HttpStatusCode.BAD_REQUEST, 'VALIDATION_ERROR');
    this.details = details;
  }
}
