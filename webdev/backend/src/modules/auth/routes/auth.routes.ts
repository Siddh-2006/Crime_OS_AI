import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { AuthService } from '../services/AuthService';
import { TokenService } from '../services/TokenService';
import { OtpService } from '../services/OtpService';
import { UserRepository } from '../../user/repositories/UserRepository';
import { validate } from '../../../common/middlewares/validate.middleware';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import {
  registerCitizenSchema,
  verifyEmailSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validator';
import {
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  otpVerifyLimiter,
  resendOtpLimiter,
} from '../../../common/middlewares/rateLimiter.middleware';

// Dependency composition — wire up at the router level
const userRepository = new UserRepository();
const tokenService = new TokenService();
const otpService = new OtpService();
const authService = new AuthService(userRepository, tokenService, otpService);
const authController = new AuthController(authService);

const router = Router();

/**
 * POST /auth/register
 * Citizen self-registration with email OTP verification
 */
router.post('/register', registerLimiter, validate(registerCitizenSchema), authController.register);

/**
 * POST /auth/verify-email
 * Verify email using OTP sent during registration
 */
router.post('/verify-email', otpVerifyLimiter, validate(verifyEmailSchema), authController.verifyEmail);

/**
 * POST /auth/resend-otp
 * Resend email verification OTP
 */
router.post('/resend-otp', resendOtpLimiter, validate(resendOtpSchema), authController.resendOtp);

/**
 * POST /auth/login
 * Citizen login — issues access + refresh token pair
 */
router.post('/login', loginLimiter, validate(loginSchema), authController.login);

/**
 * POST /auth/forgot-password
 * Sends password reset OTP to registered email
 */
router.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * POST /auth/reset-password
 * Resets password using OTP
 */
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

/**
 * POST /auth/refresh-token
 * Rotates refresh token using HttpOnly cookie
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * POST /auth/logout
 * Invalidates refresh token from Redis
 */
router.post('/logout', authenticate, authController.logout);

/**
 * GET /auth/me
 * Returns current citizen profile
 */
router.get('/me', authenticate, authController.me);

export default router;
