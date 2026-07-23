import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import env from '../../config/env';
import { AuthenticationError } from '../errors/AuthenticationError';
import { IJwtPayload } from '../../shared/interfaces/IJwtPayload';

/**
 * Verifies the JWT access token from the Authorization header.
 * Attaches the decoded payload to req.user.
 * Does NOT validate refresh tokens — that is done in the token service.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // Try Authorization header first (standard REST calls)
  // Fall back to ?token= query param for EventSource (SSE) connections —
  // the browser's EventSource API cannot send custom headers.
  const authHeader = req.headers.authorization;
  const queryToken = req.query?.token as string | undefined;

  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return next(new AuthenticationError('Missing or malformed Authorization header'));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as IJwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Access token has expired'));
    }
    next(new AuthenticationError('Invalid access token'));
  }
}
