

/**
 * Base application error.
 * All domain-specific errors extend this class.
 * Differentiates between operational (expected) and programming errors.
 */
export abstract class BaseError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
