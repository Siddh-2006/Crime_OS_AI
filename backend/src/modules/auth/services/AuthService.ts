import { IUserRepository } from '../../user/repositories/IUserRepository';
import { TokenService } from './TokenService';
import { OtpService } from './OtpService';
import { EmailQueue } from '../../../shared/queue/EmailQueue';
import { hashPassword, comparePassword } from '../../../shared/utils/hash.util';
import { Role } from '../../../shared/enums/roles.enum';
import { ConflictError } from '../../../common/errors/ConflictError';
import { AuthenticationError } from '../../../common/errors/AuthenticationError';
import { NotFoundError } from '../../../common/errors/NotFoundError';
import { REDIS_TTL } from '../../../shared/constants/redis.constants';
import { IUser } from '../../user/models/User.model';
import logger from '../../../config/logger';
import type {
  RegisterCitizenDto,
  VerifyEmailDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto/auth.dto';

export interface AuthResult {
  accessToken: string;
  user: Partial<IUser>;
}

/**
 * Core authentication service for citizens.
 * Orchestrates registration, verification, login, and password reset flows.
 * Contains ONLY business logic — no HTTP, no Mongoose, no Redis directly.
 */
export class AuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService,
    private readonly otpService: OtpService,
  ) {}

  async register(dto: RegisterCitizenDto): Promise<void> {
    const [emailExists, usernameExists] = await Promise.all([
      this.userRepository.existsByEmail(dto.email),
      this.userRepository.existsByUsername(dto.username),
    ]);

    if (emailExists) throw new ConflictError('An account with this email already exists');
    if (usernameExists) throw new ConflictError('This username is already taken');

    const hashedPassword = await hashPassword(dto.password);
    const hashedSecurityAnswer = await hashPassword(dto.securityAnswer.toLowerCase().trim());

    await this.userRepository.create({
      ...dto,
      dateOfBirth: new Date(dto.dateOfBirth),
      password: hashedPassword,
      securityAnswer: hashedSecurityAnswer,
      isEmailVerified: false,
    });

    const otp = await this.otpService.generateAndStoreEmailVerificationOtp(dto.email);

    await EmailQueue.enqueueVerificationOtp({
      to: dto.email,
      name: dto.firstName,
      otp,
      expiryMinutes: REDIS_TTL.OTP / 60,
    });

    logger.info('Citizen registered — verification OTP sent', { email: dto.email });
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new NotFoundError('User');
    if (user.isEmailVerified) throw new ConflictError('Email is already verified');

    await this.otpService.verifyEmailVerificationOtp(dto.email, dto.otp);

    await this.userRepository.updateById(String(user._id), { isEmailVerified: true });

    await EmailQueue.enqueueWelcomeEmail({ to: user.email, name: user.firstName });

    logger.info('Email verified successfully', { email: dto.email });
  }

  async resendOtp(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new NotFoundError('User');
    if (user.isEmailVerified) throw new ConflictError('Email is already verified');

    const otp = await this.otpService.generateAndStoreEmailVerificationOtp(email);

    await EmailQueue.enqueueVerificationOtp({
      to: email,
      name: user.firstName,
      otp,
      expiryMinutes: REDIS_TTL.OTP / 60,
    });

    logger.info('Verification OTP resent', { email });
  }

  async login(dto: LoginDto): Promise<AuthResult & { refreshToken: string }> {
    const user = await this.userRepository.findByEmail(dto.email, true);
    if (!user) throw new AuthenticationError('Invalid email or password');

    const isPasswordValid = await comparePassword(dto.password, user.password);
    if (!isPasswordValid) throw new AuthenticationError('Invalid email or password');

    if (!user.isEmailVerified) {
      throw new AuthenticationError('Please verify your email before logging in');
    }

    const { accessToken, refreshToken } = await this.tokenService.generateTokenPair({
      sub: String(user._id),
      email: user.email,
      role: Role.USER,
    });

    logger.info('Citizen logged in', { userId: String(user._id), email: user.email });

    const safeUser = this.sanitizeUser(user);
    return { accessToken, refreshToken, user: safeUser };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findByEmail(dto.email);
    // Intentionally vague response — do not reveal if email exists
    if (!user) return;

    const otp = await this.otpService.generateAndStoreForgotPasswordOtp(dto.email);

    await EmailQueue.enqueueForgotPasswordOtp({
      to: dto.email,
      name: user.firstName,
      otp,
      expiryMinutes: REDIS_TTL.OTP / 60,
    });

    logger.info('Forgot password OTP sent', { email: dto.email });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    await this.otpService.verifyForgotPasswordOtp(dto.email, dto.otp);

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) throw new NotFoundError('User');

    const hashedPassword = await hashPassword(dto.newPassword);
    await this.userRepository.updateById(String(user._id), { password: hashedPassword });

    // Invalidate any existing sessions
    await this.tokenService.invalidateRefreshToken(String(user._id));

    logger.info('Password reset successfully', { email: dto.email });
  }

  async refreshTokens(incomingRefreshToken: string): Promise<AuthResult & { refreshToken: string }> {
    const { accessToken, refreshToken } = await this.tokenService.rotateRefreshToken(incomingRefreshToken);

    return { accessToken, refreshToken, user: {} };
  }

  async logout(userId: string): Promise<void> {
    await this.tokenService.invalidateRefreshToken(userId);
    logger.info('Citizen logged out', { userId });
  }

  async getProfile(userId: string): Promise<Partial<IUser>> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');
    return this.sanitizeUser(user);
  }

  private sanitizeUser(user: IUser): Partial<IUser> {
    const { password, securityAnswer, ...safe } = user.toObject();
    void password;
    void securityAnswer;
    return safe;
  }
}
