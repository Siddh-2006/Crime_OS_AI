import { IUser } from '../models/User.model';

/**
 * Repository interface for citizen User data access.
 * Services depend on this interface, never on the Mongoose model directly.
 */
export interface IUserRepository {
  create(data: Partial<IUser>): Promise<IUser>;
  findByEmail(email: string, includePassword?: boolean): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  findById(id: string): Promise<IUser | null>;
  updateById(id: string, data: Partial<IUser>): Promise<IUser | null>;
  existsByEmail(email: string): Promise<boolean>;
  existsByUsername(username: string): Promise<boolean>;
}
