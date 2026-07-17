import { getRedisClient } from '../../../config/redis';
import { REDIS_KEYS, REDIS_TTL } from '../../../shared/constants/redis.constants';
import { generateOtp } from '../../../shared/utils/otp.util';
import { ValidationError } from '../../../common/errors/ValidationError';

/**
 * Manages OTP lifecycle in Redis.
 * Generates, stores, and verifies cryptographically secure OTPs.
 * OTPs expire automatically after REDIS_TTL.OTP seconds.
 */
export class OtpService {
  async generateAndStoreEmailVerificationOtp(email: string): Promise<string> {
    const otp = generateOtp();
    const redis = getRedisClient();
    await redis.setex(REDIS_KEYS.OTP_EMAIL_VERIFY(email), REDIS_TTL.OTP, otp);
    return otp;
  }

  async generateAndStoreForgotPasswordOtp(email: string): Promise<string> {
    const otp = generateOtp();
    const redis = getRedisClient();
    await redis.setex(REDIS_KEYS.OTP_FORGOT_PASSWORD(email), REDIS_TTL.OTP, otp);
    return otp;
  }

  async verifyEmailVerificationOtp(email: string, otp: string): Promise<void> {
    const redis = getRedisClient();
    const stored = await redis.get(REDIS_KEYS.OTP_EMAIL_VERIFY(email));

    if (!stored || stored !== otp) {
      throw new ValidationError('Invalid or expired OTP');
    }

    // Consume the OTP — single use
    await redis.del(REDIS_KEYS.OTP_EMAIL_VERIFY(email));
  }

  async verifyForgotPasswordOtp(email: string, otp: string): Promise<void> {
    const redis = getRedisClient();
    const stored = await redis.get(REDIS_KEYS.OTP_FORGOT_PASSWORD(email));

    if (!stored || stored !== otp) {
      throw new ValidationError('Invalid or expired OTP');
    }

    // Consume the OTP — single use
    await redis.del(REDIS_KEYS.OTP_FORGOT_PASSWORD(email));
  }
}
