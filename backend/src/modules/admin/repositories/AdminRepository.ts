import { Admin, IAdmin } from '../models/Admin.model';
import { IAdminRepository } from './IAdminRepository';

export class AdminRepository implements IAdminRepository {
  async findByUsername(username: string, includePassword = false): Promise<IAdmin | null> {
    const query = Admin.findOne({ username: username.toLowerCase() });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findById(id: string): Promise<IAdmin | null> {
    return Admin.findById(id).exec();
  }

  async create(data: Partial<IAdmin>): Promise<IAdmin> {
    const admin = new Admin(data);
    return admin.save();
  }
}
