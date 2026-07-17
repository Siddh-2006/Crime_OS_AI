import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Hashes a plain-text password using bcrypt.
 * Salt rounds are fixed at 12 for a good security/performance balance.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Compares a plain-text password against a bcrypt hash.
 */
export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
