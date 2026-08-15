import { Router } from 'express';
import { physicalEvidenceController } from '../controllers/PhysicalEvidenceController';

const router = Router();

// Tag & Single Item lookup
router.get('/tag/:tagId', (req, res, next) => physicalEvidenceController.getByTag(req, res, next));
router.get('/:id', (req, res, next) => physicalEvidenceController.getById(req, res, next));
router.get('/:id/verify', (req, res, next) => physicalEvidenceController.verifyIntegrity(req, res, next));

// Dispatch & Receipt Acknowledgment
router.post('/:id/dispatch', (req, res, next) => physicalEvidenceController.initiateDispatch(req, res, next));
router.post('/:id/acknowledge', (req, res, next) => physicalEvidenceController.acknowledgeReceipt(req, res, next));

// Case physical evidence
router.post('/cases/:id/physical-evidence', (req, res, next) => physicalEvidenceController.create(req, res, next));
router.get('/cases/:id/physical-evidence', (req, res, next) => physicalEvidenceController.getByCase(req, res, next));

export default router;
