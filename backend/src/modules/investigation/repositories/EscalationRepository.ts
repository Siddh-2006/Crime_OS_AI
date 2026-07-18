import { Escalation, IEscalation, EscalationStatus } from '../models/Escalation.model';

export class EscalationRepository {
  async create(data: Partial<IEscalation>): Promise<IEscalation> {
    const escalation = new Escalation(data);
    return escalation.save();
  }

  async findByCaseId(caseId: string): Promise<IEscalation[]> {
    return Escalation.find({ case_id: caseId }).sort({ triggered_at: -1 }).exec();
  }

  async findByEscalationId(escalationId: string): Promise<IEscalation | null> {
    return Escalation.findOne({ escalation_id: escalationId }).exec();
  }

  async findByStatus(status: EscalationStatus): Promise<IEscalation[]> {
    return Escalation.find({ status }).exec();
  }

  async updateStatus(escalationId: string, status: EscalationStatus): Promise<IEscalation | null> {
    return Escalation.findOneAndUpdate(
      { escalation_id: escalationId },
      { status },
      { new: true },
    ).exec();
  }
}
