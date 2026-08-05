import { Router } from 'express';
import multer from 'multer';
import { ComplaintController } from '../controllers/ComplaintController';
import { ComplaintService } from '../services/ComplaintService';
import { ComplaintRepository } from '../repositories/ComplaintRepository';
import { validate } from '../../../common/middlewares/validate.middleware';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import { authorize } from '../../../common/middlewares/authorize.middleware';
import { Role } from '../../../shared/enums/roles.enum';
import {
  createComplaintSchema,
  approveComplaintSchema,
  rejectComplaintSchema,
  updateComplaintSchema,
  addEvidenceSchema,
} from '../validators/complaint.validator';

const complaintRepository = new ComplaintRepository();
const complaintService = new ComplaintService(complaintRepository);
const complaintController = new ComplaintController(complaintService);
const intakeUpload = multer({ storage: multer.memoryStorage() });

const router = Router();

// ─── Shared Authenticated Routes ─────────────────────────────────────────────
router.get('/police-stations/search', authenticate, complaintController.searchPoliceStations);

// ─── Citizen Routes ──────────────────────────────────────────────────────────
router.post(
  '/multimodal-intake',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  intakeUpload.array('files'),
  complaintController.analyzeComplaintIntake,
);
router.post(
  '/upload-signature',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  complaintController.getUploadSignature,
);
router.post(
  '/',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  validate(createComplaintSchema),
  complaintController.createComplaint,
);
router.get(
  '/',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  complaintController.getCitizenComplaints,
);
router.get(
  '/:id',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  complaintController.getComplaintById,
);
router.post(
  '/:id/evidence',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  validate(addEvidenceSchema),
  complaintController.addEvidence,
);
router.post(
  '/:id/physical-evidence',
  authenticate,
  authorize(Role.USER, Role.IO),
  complaintController.addPhysicalEvidence,
);
router.post(
  '/:id/evidence/:evidenceId/transfer',
  authenticate,
  authorize(Role.IO),
  complaintController.transferEvidence,
);

// ─── Police Station (SHO & IO Shared) Routes ─────────────────────────────────
router.get(
  '/police/ios',
  authenticate,
  authorize(Role.SHO, Role.IO),
  complaintController.getStationIOs,
);
router.get(
  '/station/list',
  authenticate,
  authorize(Role.SHO, Role.IO),
  complaintController.getStationComplaints,
);

// ─── SHO Actions ─────────────────────────────────────────────────────────────
router.patch(
  '/:id/approve',
  authenticate,
  authorize(Role.SHO),
  validate(approveComplaintSchema),
  complaintController.approveComplaint,
);
router.patch(
  '/:id/reject',
  authenticate,
  authorize(Role.SHO),
  validate(rejectComplaintSchema),
  complaintController.rejectComplaint,
);

// ─── IO Actions ──────────────────────────────────────────────────────────────
router.patch(
  '/:id/update',
  authenticate,
  authorize(Role.IO),
  validate(updateComplaintSchema),
  complaintController.updateComplaint,
);
router.patch(
  '/:id/register-fir',
  authenticate,
  authorize(Role.SHO),
  complaintController.registerFir,
);
router.patch(
  '/:id/close',
  authenticate,
  authorize(Role.IO, Role.SHO),
  complaintController.closeComplaint,
);
router.post(
  '/:id/rerun-pipeline',
  authenticate,
  authorize(Role.SHO, Role.IO),
  complaintController.rerunPipeline,
);

export default router;
