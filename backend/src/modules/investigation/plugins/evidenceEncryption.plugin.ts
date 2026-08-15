import { Schema } from 'mongoose';
import {
  encryptValue,
  decryptValue,
} from '../../../shared/utils/encryption.util';

/**
 * Evidence Encryption Plugin
 *
 * This plugin automatically:
 * 1. Encrypts sensitive fields before saving to MongoDB
 * 2. Decrypts sensitive fields when fetching from MongoDB
 * 3. Sets an `isEncrypted` flag to track encryption state
 *
 * Usage: schema.plugin(evidenceEncryptionPlugin, { fieldsToEncrypt: [...] })
 */

interface EncryptionPluginOptions {
  fieldsToEncrypt: string[];
}

export function evidenceEncryptionPlugin(
  schema: Schema,
  options: EncryptionPluginOptions,
) {
  const { fieldsToEncrypt } = options;

  if (!fieldsToEncrypt || fieldsToEncrypt.length === 0) {
    console.warn('Evidence encryption plugin initialized with no fields to encrypt');
    return;
  }

  /**
   * PRE-SAVE HOOK: Encrypt sensitive fields before storing in DB
   */
  schema.pre('save', function (next) {
    try {
      const doc = this as any;

      // Encrypt each field
      for (const fieldPath of fieldsToEncrypt) {
        const parts = fieldPath.split('.');
        let current = doc;

        // Navigate to parent
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }

        // Encrypt the leaf field if it has a value
        const leafField = parts[parts.length - 1];
        if (current[leafField] !== null && current[leafField] !== undefined) {
          current[leafField] = encryptValue(current[leafField]);
        }
      }

      // Mark document as encrypted
      doc.isEncrypted = true;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  /**
   * PRE-UPDATE HOOKS: Encrypt sensitive fields before updateOne/updateMany/findByIdAndUpdate
   */
  schema.pre('updateOne', function (next) {
    try {
      const update = this.getUpdate() as any;
      if (!update) {
        return next();
      }

      const doc = Array.isArray(update) ? update[0] : update;
      if (!doc) {
        return next();
      }

      // Handle both direct updates and $set operations
      if (doc.$set) {
        encryptFields(doc.$set, fieldsToEncrypt);
      } else {
        encryptFields(doc, fieldsToEncrypt);
      }

      doc.isEncrypted = true;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  schema.pre('findOneAndUpdate', function (next) {
    try {
      const update = this.getUpdate() as any;
      if (!update) {
        return next();
      }

      if (update.$set) {
        encryptFields(update.$set, fieldsToEncrypt);
      } else {
        encryptFields(update, fieldsToEncrypt);
      }

      update.isEncrypted = true;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  schema.pre('updateMany', function (next) {
    try {
      const update = this.getUpdate() as any;
      if (!update) {
        return next();
      }

      if (update.$set) {
        encryptFields(update.$set, fieldsToEncrypt);
      } else {
        encryptFields(update, fieldsToEncrypt);
      }

      update.isEncrypted = true;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  /**
   * POST-FIND HOOKS: Decrypt sensitive fields after fetching from DB
   * Applied to all find operations to ensure decryption happens transparently
   */
  const decryptDocuments = function (docs: any, next: any) {
    try {
      // Handle both single documents and arrays
      const docArray = Array.isArray(docs) ? docs : [docs];

      for (const doc of docArray) {
        if (!doc) continue;

        // Only decrypt if the document is marked as encrypted
        if (doc.isEncrypted) {
          decryptFields(doc, fieldsToEncrypt);
        }
      }

      next();
    } catch (error) {
      next(error as Error);
    }
  };

  schema.post('find', decryptDocuments);
  schema.post('findOne', decryptDocuments);
  schema.post('findOneAndUpdate', decryptDocuments);
  schema.post('save', decryptDocuments);

  /**
   * Handle aggregation results - decrypt if encrypted
   */
  schema.post('aggregate', function (docs: any[]) {
    if (!Array.isArray(docs)) return;

    docs.forEach((doc) => {
      if (doc && doc.isEncrypted) {
        decryptFields(doc, fieldsToEncrypt);
      }
    });
  });
}

/**
 * Helper function to encrypt fields in an object
 */
function encryptFields(doc: any, fieldsToEncrypt: string[]) {
  for (const fieldPath of fieldsToEncrypt) {
    const parts = fieldPath.split('.');
    let current = doc;

    // Navigate to parent
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
}

/**
 * Helper function to decrypt fields in an object
 */
function decryptFields(doc: any, fieldsToDecrypt: string[]) {
  for (const fieldPath of fieldsToDecrypt) {
    const parts = fieldPath.split('.');
    let current = doc;

    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        continue;
      }
      current = current[part];
    }

    // Decrypt the leaf field if it's encrypted
    const leafField = parts[parts.length - 1];
    if (current[leafField] !== null && current[leafField] !== undefined) {
      current[leafField] = decryptValue(current[leafField]);
    }
  }
}
