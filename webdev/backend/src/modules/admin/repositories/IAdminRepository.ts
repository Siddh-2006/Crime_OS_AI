import { IAdmin } from '../models/Admin.model';

export interface IAdminRepository {
  findByUsername(username: string, includePassword?: boolean): Promise<IAdmin | null>;
  findById(id: string): Promise<IAdmin | null>;
  create(data: Partial<IAdmin>): Promise<IAdmin>;
}
