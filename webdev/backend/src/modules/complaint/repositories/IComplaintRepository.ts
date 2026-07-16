import { IComplaint } from '../models/Complaint.model';

export interface IComplaintRepository {
  create(data: Partial<IComplaint>): Promise<IComplaint>;
  findById(id: string): Promise<IComplaint | null>;
  findByComplaintNumber(complaintNumber: string): Promise<IComplaint | null>;
  findCitizenComplaints(citizenId: string): Promise<IComplaint[]>;
  findStationComplaints(
    stationId: string,
    filters?: {
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ complaints: IComplaint[]; total: number }>;
  update(id: string, updateData: Partial<IComplaint>): Promise<IComplaint | null>;
  save(complaint: IComplaint): Promise<IComplaint>;
}
