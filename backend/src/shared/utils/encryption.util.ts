import crypto from 'crypto';

/**
 * AES-256-GCM Encryption/Decryption Utility
 * 
 * This module provides transparent encryption and decryption using AES-256-GCM.
 * - Key is read from ENCRYPTION_KEY environment variable (32 bytes for AES-256)
 * - Each encryption generates a random IV and auth tag
 * - IV and auth tag are stored with the ciphertext for decryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const ENCRYPTION_PREFIX = 'enc:'; // Prefix to identify encrypted data

/**
 * Get encryption key from environment variable
 * @throws Error if ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  // Handle both base64-encoded and raw key formats
  let keyBuffer: Buffer;
  try {
    // Try to decode as base64 first
    keyBuffer = Buffer.from(key, 'base64');
  } catch {
    // If base64 decode fails, treat as raw string
    keyBuffer = Buffer.from(key, 'utf8');
  }

  // Validate key length (AES-256 requires 32 bytes)
  if (keyBuffer.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (256 bits). Current length: ${keyBuffer.length} bytes`,
    );
  }

  return keyBuffer;
}

/**
 * Encrypt a value using AES-256-GCM
 * @param plaintext - Value to encrypt (will be converted to string if not already)
 * @returns Encrypted string with format: "enc:<iv>:<ciphertext>:<authTag>"
 */
export function encryptValue(plaintext: any): string {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Convert to JSON string to preserve types
    const jsonString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

    let encrypted = cipher.update(jsonString, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: "enc:<iv>:<ciphertext>:<authTag>"
    return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${(error as Error).message}`);
  }
}

/**
 * Decrypt a value encrypted with encryptValue()
 * @param encrypted - Encrypted string in format "enc:<iv>:<ciphertext>:<authTag>"
 * @returns Decrypted value (string or parsed JSON if original was an object)
 * @throws Error if decryption fails or data is not encrypted
 */
export function decryptValue(encrypted: any): any {
  // If not a string or doesn't have encryption prefix, return as-is
  if (!encrypted || typeof encrypted !== 'string' || !encrypted.startsWith(ENCRYPTION_PREFIX)) {
    return encrypted;
  }

  try {
    const key = getEncryptionKey();

    // Parse format: "enc:<iv>:<ciphertext>:<authTag>"
    const parts = encrypted.slice(ENCRYPTION_PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivHex, ciphertextHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Try to parse as JSON if it looks like JSON
    try {
      return JSON.parse(decrypted);
    } catch {
      // If not valid JSON, return as string
      return decrypted;
    }
  } catch (error) {
    throw new Error(`Decryption failed: ${(error as Error).message}`);
  }
}

/**
 * Check if a value is encrypted (has the encryption prefix)
 * @param value - Value to check
 */
export function isEncrypted(value: any): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypt an object by recursively encrypting specified fields
 * @param obj - Object to encrypt
 * @param fieldsToEncrypt - Array of field names/paths to encrypt (e.g., ['name', 'metadata.email'])
 * @returns New object with encrypted fields
 */
export function encryptObject(obj: any, fieldsToEncrypt: string[]): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const encrypted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const fieldPath of fieldsToEncrypt) {
    const parts = fieldPath.split('.');
    let current = encrypted;

    // Navigate to parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }

    // Encrypt the leaf field
    const leafField = parts[parts.length - 1];
    if (current[leafField] !== null && current[leafField] !== undefined) {
      current[leafField] = encryptValue(current[leafField]);
    }
  }

  return encrypted;
}

/**
 * Decrypt an object by recursively decrypting specified fields
 * @param obj - Object to decrypt
 * @param fieldsToDecrypt - Array of field names/paths to decrypt (e.g., ['name', 'metadata.email'])
 * @returns New object with decrypted fields
 */
export function decryptObject(obj: any, fieldsToDecrypt: string[]): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const decrypted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const fieldPath of fieldsToDecrypt) {
    const parts = fieldPath.split('.');
    let current = decrypted;

    // Navigate to parent object
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        continue; // Field doesn't exist, skip
      }
      current = current[part];
    }

    // Decrypt the leaf field if it's encrypted
    const leafField = parts[parts.length - 1];
    if (current[leafField] !== null && current[leafField] !== undefined) {
      current[leafField] = decryptValue(current[leafField]);
    }
  }

  return decrypted;
}

/**
 * Encrypt an array of objects by recursively encrypting specified fields in each
 * @param arr - Array of objects to encrypt
 * @param fieldsToEncrypt - Array of field names/paths to encrypt
 * @returns New array with encrypted objects
 */
export function encryptArray(arr: any[], fieldsToEncrypt: string[]): any[] {
  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr.map((item) => encryptObject(item, fieldsToEncrypt));
}

/**
 * Decrypt an array of objects by recursively decrypting specified fields in each
 * @param arr - Array of objects to decrypt
 * @param fieldsToDecrypt - Array of field names/paths to decrypt
 * @returns New array with decrypted objects
 */
export function decryptArray(arr: any[], fieldsToDecrypt: string[]): any[] {
  if (!Array.isArray(arr)) {
    return arr;
  }

  return arr.map((item) => decryptObject(item, fieldsToDecrypt));
}
