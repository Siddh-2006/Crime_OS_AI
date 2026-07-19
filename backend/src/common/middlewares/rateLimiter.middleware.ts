import { Request, Response, NextFunction, RequestHandler } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { getRedisClient } from '../../config/redis';
import { HttpStatusCode } from '../enums/httpStatus.enum';
import { sendError } from '../../shared/utils/response.util';

export interface RateLimiterConfig {
  /** Identifier for this limiter, used as Redis key prefix */
  keyPrefix: string;
  /** Maximum number of requests */
  points: number;
  /** Window duration in seconds */
  duration: number;
}

/**
 * Factory function that creates a Redis-backed rate limiter middleware.
 * Rate limits are applied per IP address.
 *
 * @example
 * router.post('/login', createRateLimiter({ keyPrefix: 'login', points: 10, duration: 900 }), ...)
 */
export function createRateLimiter(config: RateLimiterConfig): RequestHandler {
  const limiter = new RateLimiterRedis({
    storeClient: getRedisClient(),
    keyPrefix: `rl:${config.keyPrefix}`,
    points: config.points,
    duration: config.duration,
  });

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.ip ?? 'unknown';

    try {
      await limiter.consume(key);
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(err.msBeforeNext / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.setHeader('X-RateLimit-Limit', config.points);
        res.setHeader('X-RateLimit-Remaining', err.remainingPoints ?? 0);
        sendError(res, HttpStatusCode.TOO_MANY_REQUESTS, {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again in ${retryAfter} seconds.`,
        });
      } else {
        // Fallback if Redis is down — just let the request through for dev/testing
        next();
      }
    }
  };
}

// ─── Pre-configured limiters ──────────────────────────────────────────────────

export const registerLimiter = createRateLimiter({
  keyPrefix: 'register',
  points: 5,
  duration: 3600, // 1 hour
});

export const loginLimiter = createRateLimiter({
  keyPrefix: 'login',
  points: 10,
  duration: 900, // 15 min
});

export const forgotPasswordLimiter = createRateLimiter({
  keyPrefix: 'forgot_password',
  points: 5,
  duration: 3600,
});

export const otpVerifyLimiter = createRateLimiter({
  keyPrefix: 'otp_verify',
  points: 10,
  duration: 3600,
});

export const resendOtpLimiter = createRateLimiter({
  keyPrefix: 'resend_otp',
  points: 5,
  duration: 3600,
});
