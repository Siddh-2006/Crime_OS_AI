import crypto from 'crypto';

const OTP_LENGTH = 6;

/**
 * Generates a cryptographically secure numeric OTP.
 * Uses crypto.randomInt for uniform distribution.
 */
export function generateOtp(): string {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return crypto.randomInt(min, max).toString();
}
