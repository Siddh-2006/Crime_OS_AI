import jwt from 'jsonwebtoken';
import { getRedisClient } from '../../../config/redis';
import env from '../../../config/env';
import { REDIS_KEYS, REDIS_TTL } from '../../../shared/constants/redis.constants';
import { IJwtPayload } from '../../../shared/interfaces/IJwtPayload';
import { AuthenticationError } from '../../../common/errors/AuthenticationError';
import logger from '../../../config/logger';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Manages JWT lifecycle: generation, verification, and Redis-backed refresh token storage.
 * Refresh tokens are stored ONLY in Redis — never in MongoDB.
 */
export class TokenService {
  generateAccessToken(payload: IJwtPayload): string {
    return jwt.sign(
      { sub: payload.sub, email: payload.email, role: payload.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'] }
    );
  }

  generateRefreshToken(payload: IJwtPayload): string {
    return jwt.sign(
      { sub: payload.sub, email: payload.email, role: payload.role },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions['expiresIn'] }
    );
  }

  async generateTokenPair(payload: IJwtPayload): Promise<TokenPair> {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    await this.storeRefreshToken(payload.sub, refreshToken);

    return { accessToken, refreshToken };
  }

  /**
   * Validates a refresh token, checks Redis for existence, and issues a new token pair.
   * Implements refresh token rotation for improved security.
   */
  async rotateRefreshToken(incomingRefreshToken: string): Promise<TokenPair> {
    let decoded: IJwtPayload;
    try {
      decoded = jwt.verify(incomingRefreshToken, env.JWT_REFRESH_SECRET) as IJwtPayload;
    } catch {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const storedToken = await this.getStoredRefreshToken(decoded.sub);

    if (!storedToken || storedToken !== incomingRefreshToken) {
      // Possible token reuse — invalidate all sessions for this user
      await this.deleteRefreshToken(decoded.sub);
      throw new AuthenticationError('Refresh token reuse detected. Please login again.');
    }

    const newPayload: IJwtPayload = {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };

    // Rotate: delete old, issue new
    await this.deleteRefreshToken(decoded.sub);
    return this.generateTokenPair(newPayload);
  }

  async invalidateRefreshToken(userId: string): Promise<void> {
    await this.deleteRefreshToken(userId);
    logger.info('Refresh token invalidated', { userId });
  }

  private async storeRefreshToken(userId: string, token: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.setex(REDIS_KEYS.REFRESH_TOKEN(userId), REDIS_TTL.REFRESH_TOKEN, token);
    } catch (err) {
      logger.warn('Failed to store refresh token in Redis (Redis may be down)', { userId });
    }
  }

  private async getStoredRefreshToken(userId: string): Promise<string | null> {
    try {
      const redis = getRedisClient();
      return await redis.get(REDIS_KEYS.REFRESH_TOKEN(userId));
    } catch (err) {
      logger.warn('Failed to get refresh token from Redis (Redis may be down)', { userId });
      return null;
    }
  }

  private async deleteRefreshToken(userId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(REDIS_KEYS.REFRESH_TOKEN(userId));
    } catch (err) {
      logger.warn('Failed to delete refresh token from Redis (Redis may be down)', { userId });
    }
  }
}
