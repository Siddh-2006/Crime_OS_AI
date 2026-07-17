import { User, IUser } from '../models/User.model';
import { IUserRepository } from './IUserRepository';

/**
 * Mongoose-backed implementation of IUserRepository.
 * This is the ONLY file that directly interacts with the User Mongoose model.
 */
export class UserRepository implements IUserRepository {
  async create(data: Partial<IUser>): Promise<IUser> {
    const user = new User(data);
    return user.save();
  }

  async findByEmail(email: string, includePassword = false): Promise<IUser | null> {
    const query = User.findOne({ email: email.toLowerCase() });
    if (includePassword) {
      query.select('+password');
    }
    return query.exec();
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return User.findOne({ username: username.toLowerCase() }).exec();
  }

  async findById(id: string): Promise<IUser | null> {
    return User.findById(id).exec();
  }

  async updateById(id: string, data: Partial<IUser>): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await User.countDocuments({ email: email.toLowerCase() });
    return count > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const count = await User.countDocuments({ username: username.toLowerCase() });
    return count > 0;
  }
}
