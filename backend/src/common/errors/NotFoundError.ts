import { BaseError } from './BaseError';
import { HttpStatusCode } from '../enums/httpStatus.enum';

export class NotFoundError extends BaseError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, HttpStatusCode.NOT_FOUND, 'NOT_FOUND');
  }
}
