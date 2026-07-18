import { DepartmentRequest, IDepartmentRequest, DeptRequestStatus } from '../models/DepartmentRequest.model';

export class DepartmentRequestRepository {
  async create(data: Partial<IDepartmentRequest>): Promise<IDepartmentRequest> {
    const req = new DepartmentRequest(data);
    return req.save();
  }

  async findByCaseId(caseId: string): Promise<IDepartmentRequest[]> {
    return DepartmentRequest.find({ case_id: caseId }).sort({ createdAt: -1 }).exec();
  }

  async findByRequestId(requestId: string): Promise<IDepartmentRequest | null> {
    return DepartmentRequest.findOne({ request_id: requestId }).exec();
  }

  async findByStatus(caseId: string, status: DeptRequestStatus): Promise<IDepartmentRequest[]> {
    return DepartmentRequest.find({ case_id: caseId, status }).exec();
  }

  async findOverdue(): Promise<IDepartmentRequest[]> {
    return DepartmentRequest.find({ status: 'overdue' }).exec();
  }

  async updateStatus(requestId: string, status: DeptRequestStatus, extra: Partial<IDepartmentRequest> = {}): Promise<IDepartmentRequest | null> {
    return DepartmentRequest.findOneAndUpdate(
      { request_id: requestId },
      { status, ...extra },
      { new: true },
    ).exec();
  }

  async markSent(requestId: string, sentVia: IDepartmentRequest['sent_via']): Promise<IDepartmentRequest | null> {
    return DepartmentRequest.findOneAndUpdate(
      { request_id: requestId },
      { status: 'sent', sent_via: sentVia, sent_at: new Date() },
      { new: true },
    ).exec();
  }

  async recordResponse(requestId: string, responseRef: string): Promise<IDepartmentRequest | null> {
    return DepartmentRequest.findOneAndUpdate(
      { request_id: requestId },
      { status: 'response_received', response_ref: responseRef, response_at: new Date() },
      { new: true },
    ).exec();
  }
}
