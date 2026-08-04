import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { sendSuccess } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import env from '../../../config/env';
import type {
  RegisterCitizenDto,
  CreateComplainantProfileDto,
  VerifyEmailDto,
  ResendOtpDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto/auth.dto';
import { AuthenticationError } from '../../../common/errors/AuthenticationError';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: env.JWT_REFRESH_EXPIRY_SECONDS * 1000,
  path: '/',
};

/**
 * Citizen authentication controller.
 * Handles HTTP concerns only (req/res/cookies).
 * All business logic is delegated to AuthService.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.register(req.body as RegisterCitizenDto);
      sendSuccess(res, HttpStatusCode.CREATED, 'Registration successful. Please verify your email.');
    } catch (err) {
      next(err);
    }
  };

  createComplainantProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const complainant = await this.authService.createComplainantProfile(req.body as CreateComplainantProfileDto);
      sendSuccess(res, HttpStatusCode.CREATED, 'Complainant profile created. Please verify the email address.', { id: complainant._id, email: complainant.email });
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.verifyEmail(req.body as VerifyEmailDto);
      sendSuccess(res, HttpStatusCode.OK, 'Email verified successfully. You can continue with the complaint flow.');
    } catch (err) {
      next(err);
    }
  };

  resendOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body as ResendOtpDto;
      await this.authService.resendOtp(email);
      sendSuccess(res, HttpStatusCode.OK, 'OTP sent to your email address.');
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body as LoginDto);
      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions);
      sendSuccess(res, HttpStatusCode.OK, 'Login successful', {
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.forgotPassword(req.body as ForgotPasswordDto);
      // Always return 200 — do not reveal if email exists
      sendSuccess(res, HttpStatusCode.OK, 'If that email is registered, you will receive an OTP shortly.');
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.resetPassword(req.body as ResetPasswordDto);
      sendSuccess(res, HttpStatusCode.OK, 'Password reset successfully. Please login with your new password.');
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const incomingToken = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;
      if (!incomingToken) throw new AuthenticationError('Refresh token not found');

      const result = await this.authService.refreshTokens(incomingToken);
      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions);
      sendSuccess(res, HttpStatusCode.OK, 'Tokens refreshed', {
        accessToken: result.accessToken,
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      await this.authService.logout(userId);
      res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
      sendSuccess(res, HttpStatusCode.OK, 'Logged out successfully');
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const user = await this.authService.getProfile(userId);
      sendSuccess(res, HttpStatusCode.OK, 'Profile fetched', user);
    } catch (err) {
      next(err);
    }
  };
}
