import { Router } from 'express';
import { PoliceController } from '../controllers/PoliceController';
import { PoliceAuthService } from '../services/PoliceAuthService';
import { OfficerRepository } from '../repositories/OfficerRepository';
import { TokenService } from '../../auth/services/TokenService';
import { validate } from '../../../common/middlewares/validate.middleware';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import { authorize } from '../../../common/middlewares/authorize.middleware';
import { Role } from '../../../shared/enums/roles.enum';
import { policeLoginSchema } from '../../auth/validators/auth.validator';
import { loginLimiter } from '../../../common/middlewares/rateLimiter.middleware';

const officerRepository = new OfficerRepository();
const tokenService = new TokenService();
const policeAuthService = new PoliceAuthService(officerRepository, tokenService);
const policeController = new PoliceController(policeAuthService);

const router = Router();

/**
 * POST /police/login
 * Police officer login — no registration available
 */
router.post('/login', loginLimiter, validate(policeLoginSchema), policeController.login);

/**
 * GET /police/me
 * Returns current officer profile
 */
router.get('/me', authenticate, authorize(Role.SHO, Role.IO), policeController.me);

/**
 * PATCH /police/profile
 * Updates current officer profile
 */
router.patch('/profile', authenticate, authorize(Role.SHO, Role.IO), policeController.updateProfile);

/**
 * POST /police/logout
 * Invalidates officer refresh token from Redis
 */
router.post('/logout', authenticate, authorize(Role.SHO, Role.IO), policeController.logout);

export default router;
