import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: unknown;
}

/**
 * Sends a standardised success JSON response.
 */
export function sendSuccess<T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
): void {
  const payload: ApiResponse<T> = {
    success: true,
    message,
    ...(data !== undefined && { data }),
  };
  res.status(statusCode).json(payload);
}

/**
 * Sends a standardised error JSON response.
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: unknown,
): void {
  const payload: ApiResponse = {
    success: false,
    message: typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: string }).message)
      : 'An error occurred',
    error,
  };
  res.status(statusCode).json(payload);
}
