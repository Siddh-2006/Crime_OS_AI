import { IAdminRepository } from '../repositories/IAdminRepository';
import { TokenService } from '../../auth/services/TokenService';
import { comparePassword } from '../../../shared/utils/hash.util';
import { AuthenticationError } from '../../../common/errors/AuthenticationError';
import { Role } from '../../../shared/enums/roles.enum';
import { IAdmin } from '../models/Admin.model';
import logger from '../../../config/logger';

export interface AdminAuthResult {
  accessToken: string;
  refreshToken: string;
  admin: Partial<IAdmin>;
}

export class AdminAuthService {
  constructor(
    private readonly adminRepository: IAdminRepository,
    private readonly tokenService: TokenService,
  ) {}

  async login(username: string, password: string): Promise<AdminAuthResult> {
    const admin = await this.adminRepository.findByUsername(username, true);
    if (!admin) throw new AuthenticationError('Invalid credentials');

    const isPasswordValid = await comparePassword(password, admin.password);
    if (!isPasswordValid) throw new AuthenticationError('Invalid credentials');

    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      sub: String(admin._id),
      email: admin.username, // Use username as email identifier in JWT payload
      role: Role.ADMIN,
    });

    logger.info('Admin logged in', { adminId: String(admin._id), username: admin.username });

    return {
      accessToken,
      refreshToken,
      admin: {
        _id: admin._id,
        username: admin.username,
      },
    };
  }

  async logout(adminId: string): Promise<void> {
    await this.tokenService.invalidateRefreshToken(adminId);
    logger.info('Admin logged out', { adminId });
  }

  async getProfile(adminId: string): Promise<Partial<IAdmin>> {
    const admin = await this.adminRepository.findById(adminId);
    if (!admin) throw new AuthenticationError('Admin not found');
    return {
      _id: admin._id,
      username: admin.username,
    };
  }
}
