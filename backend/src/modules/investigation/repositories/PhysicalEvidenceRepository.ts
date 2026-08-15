import { PhysicalEvidence, IPhysicalEvidence, ICustodyNode } from '../models/PhysicalEvidence.model';
import { Types } from 'mongoose';

export class PhysicalEvidenceRepository {
  async create(data: Partial<IPhysicalEvidence>): Promise<IPhysicalEvidence> {
    return await PhysicalEvidence.create(data);
  }

  async findByTagId(tagId: string): Promise<IPhysicalEvidence | null> {
    return await PhysicalEvidence.findOne({ evidenceTagId: tagId }).exec();
  }

  async findById(id: string): Promise<IPhysicalEvidence | null> {
    return await PhysicalEvidence.findById(id).exec();
  }

  async findByCaseId(caseId: string): Promise<IPhysicalEvidence[]> {
    return await PhysicalEvidence.find({ case_id: new Types.ObjectId(caseId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async update(id: string, updateData: Partial<IPhysicalEvidence>): Promise<IPhysicalEvidence | null> {
    return await PhysicalEvidence.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async appendCustodyNode(
    id: string,
    node: ICustodyNode,
    currentCustodian: IPhysicalEvidence['currentCustodian'],
    status: IPhysicalEvidence['status'],
    sealNumber?: string,
    sealStatus?: 'INTACT' | 'DAMAGED' | 'RE_SEALED'
  ): Promise<IPhysicalEvidence | null> {
    const updateObj: any = {
      $push: { custodyChain: node },
      $set: {
        currentCustodian,
        status,
      },
    };

    if (sealNumber) updateObj.$set.sealNumber = sealNumber;
    if (sealStatus) updateObj.$set.sealStatus = sealStatus;

    return await PhysicalEvidence.findByIdAndUpdate(id, updateObj, { new: true }).exec();
  }
}

export const physicalEvidenceRepository = new PhysicalEvidenceRepository();
