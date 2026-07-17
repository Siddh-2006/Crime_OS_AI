import { BaseError } from './BaseError';
import { HttpStatusCode } from '../enums/httpStatus.enum';

export class InternalServerError extends BaseError {
  constructor(message = 'An unexpected error occurred') {
    super(message, HttpStatusCode.INTERNAL_SERVER_ERROR, 'INTERNAL_SERVER_ERROR', false);
  }
}
