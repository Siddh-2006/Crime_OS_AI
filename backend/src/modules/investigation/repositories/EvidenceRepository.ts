import { Evidence, IEvidence, EvidenceStatus } from '../models/Evidence.model';

export class EvidenceRepository {
  async create(data: Partial<IEvidence>): Promise<IEvidence> {
    const evidence = new Evidence(data);
    return evidence.save();
  }

  async findByCaseId(caseId: string): Promise<IEvidence[]> {
    return Evidence.find({ case_id: caseId }).sort({ createdAt: -1 }).exec();
  }

  async findByEvidenceId(evidenceId: string): Promise<IEvidence | null> {
    return Evidence.findOne({ evidence_id: evidenceId }).exec();
  }

  async findByCaseIdAndStatus(caseId: string, status: EvidenceStatus): Promise<IEvidence[]> {
    return Evidence.find({ case_id: caseId, status }).exec();
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
}
