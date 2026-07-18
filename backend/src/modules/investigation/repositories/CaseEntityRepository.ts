import { CaseEntity, ICaseEntity } from '../models/CaseEntity.model';

export class CaseEntityRepository {
  async create(data: Partial<ICaseEntity>): Promise<ICaseEntity> {
    const entity = new CaseEntity(data);
    return entity.save();
  }

  async findByCaseId(caseId: string): Promise<ICaseEntity[]> {
    return CaseEntity.find({ case_id: caseId }).sort({ createdAt: 1 }).exec();
  }

  async findByCaseIdAndType(caseId: string, entityType: string): Promise<ICaseEntity[]> {
    return CaseEntity.find({ case_id: caseId, entity_type: entityType }).exec();
  }

  async findByValue(caseId: string, value: string): Promise<ICaseEntity | null> {
    return CaseEntity.findOne({ case_id: caseId, value }).exec();
  }

  async addCorroboratingEvidence(id: string, evidenceId: string): Promise<ICaseEntity | null> {
    return CaseEntity.findByIdAndUpdate(
      id,
      { $addToSet: { corroborating_evidence_ids: evidenceId } },
      { new: true },
    ).exec();
  }
}
