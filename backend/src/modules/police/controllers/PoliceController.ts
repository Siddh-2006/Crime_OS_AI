import { Request, Response, NextFunction } from 'express';
import { PoliceAuthService } from '../services/PoliceAuthService';
import { sendSuccess } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import env from '../../../config/env';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: env.JWT_REFRESH_EXPIRY_SECONDS * 1000,
  path: '/',
};

/**
 * Police authentication controller.
 * Only exposes login, logout, and profile endpoints.
 */
export class PoliceController {
  constructor(private readonly policeAuthService: PoliceAuthService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await this.policeAuthService.login(email, password);
      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions);
      sendSuccess(res, HttpStatusCode.OK, 'Login successful', {
        accessToken: result.accessToken,
        officer: result.officer,
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officerId = req.user!.sub;
      await this.policeAuthService.logout(officerId);
      res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
      sendSuccess(res, HttpStatusCode.OK, 'Logged out successfully');
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officerId = req.user!.sub;
      const officer = await this.policeAuthService.getProfile(officerId);
      sendSuccess(res, HttpStatusCode.OK, 'Profile fetched', officer);
    } catch (err) {
      next(err);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officerId = req.user!.sub;
      const updatedOfficer = await this.policeAuthService.updateProfile(officerId, req.body);
      sendSuccess(res, HttpStatusCode.OK, 'Profile updated', updatedOfficer);
    } catch (err) {
      next(err);
    }
  };
}
