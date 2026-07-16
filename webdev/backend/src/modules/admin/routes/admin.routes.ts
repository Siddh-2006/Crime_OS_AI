import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { AdminAuthService } from '../services/AdminAuthService';
import { AdminRepository } from '../repositories/AdminRepository';
import { TokenService } from '../../auth/services/TokenService';
import { validate } from '../../../common/middlewares/validate.middleware';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import { authorize } from '../../../common/middlewares/authorize.middleware';
import { Role } from '../../../shared/enums/roles.enum';
import {
  adminLoginSchema,
  createPoliceStationSchema,
  updatePoliceStationSchema,
  createOfficerSchema,
  updateOfficerSchema,
} from '../validators/admin.validator';

const adminRepository = new AdminRepository();
const tokenService = new TokenService();
const adminAuthService = new AdminAuthService(adminRepository, tokenService);
const adminController = new AdminController(adminAuthService);

const router = Router();

// ─── Admin Auth ──────────────────────────────────────────────────────────────
router.post('/login', validate(adminLoginSchema), adminController.login);
router.post('/logout', authenticate, authorize(Role.ADMIN), adminController.logout);
router.get('/me', authenticate, authorize(Role.ADMIN), adminController.me);

// ─── Police Station CRUD ─────────────────────────────────────────────────────
router.post(
  '/police-stations',
  authenticate,
  authorize(Role.ADMIN),
  validate(createPoliceStationSchema),
  adminController.createPoliceStation,
);
router.get(
  '/police-stations',
  authenticate,
  authorize(Role.ADMIN),
  adminController.listPoliceStations,
);
router.get(
  '/police-stations/:id',
  authenticate,
  authorize(Role.ADMIN),
  adminController.getPoliceStation,
);
router.put(
  '/police-stations/:id',
  authenticate,
  authorize(Role.ADMIN),
  validate(updatePoliceStationSchema),
  adminController.updatePoliceStation,
);
router.delete(
  '/police-stations/:id',
  authenticate,
  authorize(Role.ADMIN),
  adminController.deletePoliceStation,
);

// ─── Officer CRUD ────────────────────────────────────────────────────────────
router.post(
  '/officers',
  authenticate,
  authorize(Role.ADMIN),
  validate(createOfficerSchema),
  adminController.createOfficer,
);
router.get(
  '/officers',
  authenticate,
  authorize(Role.ADMIN),
  adminController.listOfficers,
);
router.get(
  '/officers/:id',
  authenticate,
  authorize(Role.ADMIN),
  adminController.getOfficer,
);
router.put(
  '/officers/:id',
  authenticate,
  authorize(Role.ADMIN),
  validate(updateOfficerSchema),
  adminController.updateOfficer,
);
router.delete(
  '/officers/:id',
  authenticate,
  authorize(Role.ADMIN),
  adminController.deleteOfficer,
);

export default router;
