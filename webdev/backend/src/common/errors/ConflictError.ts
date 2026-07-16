import { BaseError } from './BaseError';
import { HttpStatusCode } from '../enums/httpStatus.enum';

export class ConflictError extends BaseError {
  constructor(message: string) {
    super(message, HttpStatusCode.CONFLICT, 'CONFLICT');
  }
}
