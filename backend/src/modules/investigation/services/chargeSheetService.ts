import { Types } from 'mongoose';
import { ChargeSheet, IChargeSheet } from '../models/ChargeSheet.model';

export class ChargeSheetService {
  static async getByCaseId(caseId: string): Promise<IChargeSheet | null> {
    return ChargeSheet.findOne({ case_id: new Types.ObjectId(caseId) }).exec();
  }
}