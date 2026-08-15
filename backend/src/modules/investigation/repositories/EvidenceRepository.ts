import { Evidence, IEvidence, EvidenceStatus } from '../models/Evidence.model';
import { decryptObject } from '../../../shared/utils/encryption.util';

/**
 * Fields that are encrypted and need manual decryption for .lean() queries
 */
const ENCRYPTED_FIELDS = [
  'storage_ref',
  'ai_description',
  'ai_tags',
  'current_location',
  'custody_chain',
  'originalFilename',
  'aiMetadata.ocrText',
  'aiMetadata.speechTranscript',
  'aiMetadata.pdfText',
  'aiMetadata.imageTags',
  'aiMetadata.detectedObjects',
  'aiMetadata.faces',
  'aiMetadata.embeddings',
  'aiMetadata.aiSummary',
  'aiMetadata.exif',
  'aiMetadata.gps',
];

export class EvidenceRepository {
  async create(data: Partial<IEvidence>): Promise<IEvidence> {
    const evidence = new Evidence(data);
    return evidence.save();
  }

  async findByCaseId(caseId: string): Promise<IEvidence[]> {
    return Evidence.find({ case_id: caseId }).sort({ createdAt: -1 }).exec();
  }

  async findByCaseIdLean(caseId: string): Promise<IEvidence[]> {
    const docs = await Evidence.find({ case_id: caseId }).sort({ createdAt: -1 }).lean().exec();
    return this.decryptLeanDocuments(docs);
  }

  async findByEvidenceId(evidenceId: string): Promise<IEvidence | null> {
    return Evidence.findOne({ evidence_id: evidenceId }).exec();
  }

  async findByEvidenceIdLean(evidenceId: string): Promise<IEvidence | null> {
    const doc = await Evidence.findOne({ evidence_id: evidenceId }).lean().exec();
    return doc ? this.decryptLeanDocuments([doc])[0] : null;
  }

  async findByCaseIdAndStatus(caseId: string, status: EvidenceStatus): Promise<IEvidence[]> {
    return Evidence.find({ case_id: caseId, status }).exec();
  }

  async findByCaseIdAndStatusLean(caseId: string, status: EvidenceStatus): Promise<IEvidence[]> {
    const docs = await Evidence.find({ case_id: caseId, status }).lean().exec();
    return this.decryptLeanDocuments(docs);
  }

  async findByIds(ids: string[]): Promise<IEvidence[]> {
    return Evidence.find({ evidence_id: { $in: ids } }).exec();
  }

  async findByIdsLean(ids: string[]): Promise<IEvidence[]> {
    const docs = await Evidence.find({ evidence_id: { $in: ids } }).lean().exec();
    return this.decryptLeanDocuments(docs);
  }

  async updateStatus(evidenceId: string, status: EvidenceStatus): Promise<IEvidence | null> {
    return Evidence.findOneAndUpdate({ evidence_id: evidenceId }, { status }, { new: true }).exec();
  }

  async updateAiMetadata(
    evidenceId: string,
    data: Pick<IEvidence, 'ai_description' | 'ai_tags'>,
  ): Promise<IEvidence | null> {
    return Evidence.findOneAndUpdate({ evidence_id: evidenceId }, data, { new: true }).exec();
  }

  /**
   * Helper method to decrypt fields in lean documents
   * Lean queries skip Mongoose post-hooks, so decryption must happen manually
   * @param docs - Array of plain JavaScript objects from .lean() query
   * @returns Array of documents with decrypted fields
   */
  private decryptLeanDocuments(docs: any[]): IEvidence[] {
    if (!Array.isArray(docs)) {
      return docs;
    }

    return docs.map((doc) => {
      if (!doc || !doc.isEncrypted) {
        return doc;
      }
      return decryptObject(doc, ENCRYPTED_FIELDS);
    });
  }
}
