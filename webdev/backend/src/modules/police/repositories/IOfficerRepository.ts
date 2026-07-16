import { IOfficer } from '../models/Officer.model';

export interface IOfficerRepository {
  findByEmail(email: string, includePassword?: boolean): Promise<IOfficer | null>;
  findById(id: string): Promise<IOfficer | null>;
  existsByEmail(email: string): Promise<boolean>;
}
