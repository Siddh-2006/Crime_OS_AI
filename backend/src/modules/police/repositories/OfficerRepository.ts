import { Officer, IOfficer } from '../models/Officer.model';
import '../models/PoliceStation.model';
import { IOfficerRepository } from './IOfficerRepository';

export class OfficerRepository implements IOfficerRepository {
  async findByEmail(email: string, includePassword = false): Promise<IOfficer | null> {
    const query = Officer.findOne({ email: email.toLowerCase() });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findById(id: string): Promise<IOfficer | null> {
    return Officer.findById(id).populate('policeStation', 'name code city district').exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await Officer.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  }
}
