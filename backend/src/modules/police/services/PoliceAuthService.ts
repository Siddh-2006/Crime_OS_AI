import { IOfficerRepository } from '../repositories/IOfficerRepository';
import { TokenService } from '../../auth/services/TokenService';
import { comparePassword } from '../../../shared/utils/hash.util';
import { AuthenticationError } from '../../../common/errors/AuthenticationError';
import { NotFoundError } from '../../../common/errors/NotFoundError';
import { IOfficer } from '../models/Officer.model';
import logger from '../../../config/logger';

export interface PoliceAuthResult {
  accessToken: string;
  refreshToken: string;
  officer: Partial<IOfficer>;
}

/**
 * Authentication service for police officers.
 * Officers cannot register — they are seeded manually.
 */
export class PoliceAuthService {
  constructor(
    private readonly officerRepository: IOfficerRepository,
    private readonly tokenService: TokenService,
  ) {}

  async login(email: string, password: string): Promise<PoliceAuthResult> {
    const officer = await this.officerRepository.findByEmail(email, true);
    if (!officer) throw new AuthenticationError('Invalid credentials');
    if (!officer.isActive) throw new AuthenticationError('Your account has been deactivated. Contact admin.');

    const isPasswordValid = await comparePassword(password, officer.password);
    if (!isPasswordValid) throw new AuthenticationError('Invalid credentials');

    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      sub: String(officer._id),
      email: officer.email,
      role: officer.role,
    });

    logger.info('Officer logged in', {
      officerId: String(officer._id),
      badgeNumber: officer.badgeNumber,
      role: officer.role,
    });

    const safeOfficer = this.sanitizeOfficer(officer);
    return { accessToken, refreshToken, officer: safeOfficer };
  }

  async logout(officerId: string): Promise<void> {
    await this.tokenService.invalidateRefreshToken(officerId);
    logger.info('Officer logged out', { officerId });
  }

  async getProfile(officerId: string): Promise<Partial<IOfficer>> {
    const officer = await this.officerRepository.findById(officerId);
    if (!officer) throw new NotFoundError('Officer');
    return this.sanitizeOfficer(officer);
  }


  async updateProfile(officerId: string, updateData: Partial<IOfficer>): Promise<Partial<IOfficer>> {
    const officer = await this.officerRepository.findById(officerId);
    if (!officer) throw new NotFoundError('Officer');
    
    // Prevent email/password/role changes here
    if (updateData.pastExperience !== undefined) officer.pastExperience = updateData.pastExperience;
    if (updateData.expertise !== undefined) officer.expertise = updateData.expertise;
    if (updateData.photoUrl !== undefined) officer.photoUrl = updateData.photoUrl;

    await officer.save();
    return this.sanitizeOfficer(officer);
  }

  private sanitizeOfficer(officer: IOfficer): Partial<IOfficer> {
    const { password, ...safe } = officer.toObject();
    void password;
    return safe;
  }
}
