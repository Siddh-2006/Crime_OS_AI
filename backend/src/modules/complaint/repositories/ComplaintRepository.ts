import { Complaint, IComplaint } from '../models/Complaint.model';
import { IComplaintRepository } from './IComplaintRepository';

export class ComplaintRepository implements IComplaintRepository {
  async create(data: Partial<IComplaint>): Promise<IComplaint> {
    const complaint = new Complaint(data);
    return complaint.save();
  }

  async findById(id: string): Promise<IComplaint | null> {
    return Complaint.findById(id)
      .populate('citizen', 'firstName lastName email phone')
      .populate('policeStation', 'name code city district state')
      .populate('assignedSHO', 'officerName badgeNumber')
      .populate('assignedIO', 'officerName badgeNumber')
      .populate('assignedIOs', 'officerName badgeNumber')
      .exec();
  }

  async findByComplaintNumber(complaintNumber: string): Promise<IComplaint | null> {
    return Complaint.findOne({ complaintNumber, isDeleted: false })
      .populate('citizen', 'firstName lastName email phone')
      .populate('policeStation', 'name code city district state')
      .populate('assignedSHO', 'officerName badgeNumber')
      .populate('assignedIO', 'officerName badgeNumber')
      .populate('assignedIOs', 'officerName badgeNumber')
      .exec();
  }

  async findCitizenComplaints(citizenId: string): Promise<IComplaint[]> {
    return Complaint.find({ citizen: citizenId, isDeleted: false })
      .populate('policeStation', 'name code city district')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findStationComplaints(
    query: any,
    filters: {
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ complaints: IComplaint[]; total: number }> {
    const { status, search, page = 1, limit = 10 } = filters;
    const queryObj: any = { ...query, isDeleted: false };

    if (status) {
      queryObj.status = status;
    }

    if (search) {
      queryObj.$or = [
        { complaintNumber: { $regex: search, $options: 'i' } },
        { shortDescription: { $regex: search, $options: 'i' } },
        { detailedDescription: { $regex: search, $options: 'i' } },
        { firNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [complaints, total] = await Promise.all([
      Complaint.find(queryObj)
        .populate('citizen', 'firstName lastName email phone')
        .populate('assignedIO', 'officerName badgeNumber')
        .populate('assignedIOs', 'officerName badgeNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Complaint.countDocuments(queryObj),
    ]);

    return { complaints, total };
  }

  async update(id: string, updateData: Partial<IComplaint>): Promise<IComplaint | null> {
    return Complaint.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async save(complaint: IComplaint): Promise<IComplaint> {
    return complaint.save();
  }
}
