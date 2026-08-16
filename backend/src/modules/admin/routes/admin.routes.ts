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

import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

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

// ─── Department Registry CRUD ──────────────────────────────────────────────
import { DepartmentRegistryController } from '../controllers/DepartmentRegistryController';

router.get(
  '/departments',
  authenticate,
  authorize(Role.ADMIN),
  DepartmentRegistryController.getDepartments,
);
router.post(
  '/departments',
  authenticate,
  authorize(Role.ADMIN),
  DepartmentRegistryController.addDepartment,
);
router.put(
  '/departments/:id',
  authenticate,
  authorize(Role.ADMIN),
  DepartmentRegistryController.updateDepartment,
);
router.patch(
  '/departments/:id/deactivate',
  authenticate,
  authorize(Role.ADMIN),
  DepartmentRegistryController.deactivateDepartment,
);
router.patch(
  '/departments/:id/activate',
  authenticate,
  authorize(Role.ADMIN),
  DepartmentRegistryController.activateDepartment,
);

export default router;

// --- RAG Ingestion ---
router.post('/rag/ingest', authenticate, authorize(Role.ADMIN), upload.single('file'), adminController.ingestRag);
router.get('/rag/status/:jobId', authenticate, authorize(Role.ADMIN), adminController.getRagStatus);
