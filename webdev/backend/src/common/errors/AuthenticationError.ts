import { BaseError } from './BaseError';
import { HttpStatusCode } from '../enums/httpStatus.enum';

export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication failed') {
    super(message, HttpStatusCode.UNAUTHORIZED, 'AUTHENTICATION_ERROR');
  }
}
