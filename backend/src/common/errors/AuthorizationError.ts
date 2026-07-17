import { BaseError } from './BaseError';
import { HttpStatusCode } from '../enums/httpStatus.enum';

export class AuthorizationError extends BaseError {
  constructor(message = 'Insufficient permissions') {
    super(message, HttpStatusCode.FORBIDDEN, 'AUTHORIZATION_ERROR');
  }
}
