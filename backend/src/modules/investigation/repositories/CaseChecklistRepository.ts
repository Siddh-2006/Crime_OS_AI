import { CaseChecklist, ICaseChecklist, ChecklistStatus } from '../models/CaseChecklist.model';
import { Types } from 'mongoose';

export class CaseChecklistRepository {
  async create(data: Partial<ICaseChecklist>): Promise<ICaseChecklist> {
    const item = new CaseChecklist(data);
    return item.save();
  }

  async createMany(items: Partial<ICaseChecklist>[]): Promise<ICaseChecklist[]> {
    return CaseChecklist.insertMany(items) as unknown as ICaseChecklist[];
  }

  async findByCaseId(caseId: string): Promise<ICaseChecklist[]> {
    return CaseChecklist.find({ case_id: caseId }).sort({ createdAt: 1 }).exec();
  }

  async findByStatus(caseId: string, status: ChecklistStatus): Promise<ICaseChecklist[]> {
    return CaseChecklist.find({ case_id: caseId, status }).exec();
  }

  async findByStepId(caseId: string, stepId: string): Promise<ICaseChecklist | null> {
    return CaseChecklist.findOne({ case_id: caseId, step_id: stepId }).exec();
  }

  async updateStatus(
    caseId: string,
    stepId: string,
    status: ChecklistStatus,
    completedBy?: string,
  ): Promise<ICaseChecklist | null> {
    const update: Partial<ICaseChecklist> = { status };
    if (status === 'completed') {
      update.completed_by  = new Types.ObjectId(completedBy);
      update.completed_at  = new Date();
    }
    return CaseChecklist.findOneAndUpdate({ case_id: caseId, step_id: stepId }, update, { new: true }).exec();
  }

  async addProofEvidence(caseId: string, stepId: string, evidenceId: string): Promise<ICaseChecklist | null> {
    return CaseChecklist.findOneAndUpdate(
      { case_id: caseId, step_id: stepId },
      { $addToSet: { proof_evidence_ids: evidenceId } },
      { new: true },
    ).exec();
  }

  async lockByRequest(caseId: string, stepId: string, requestId: string): Promise<ICaseChecklist | null> {
    return CaseChecklist.findOneAndUpdate(
      { case_id: caseId, step_id: stepId },
      { locked_by_request_id: requestId, status: 'blocked' },
      { new: true },
    ).exec();
  }
}
