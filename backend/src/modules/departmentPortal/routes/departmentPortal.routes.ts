import { Router } from 'express';
import { DepartmentPortalController } from '../controllers/DepartmentPortalController';

const router = Router();

// Mock Auth
router.post('/login', DepartmentPortalController.login);

// Fetch requests
router.get('/inbox', DepartmentPortalController.getInbox);

// Upload signature
router.post('/upload-signature', DepartmentPortalController.getUploadSignature);

// Submit response (Phase 8 Ingestion)
router.post('/requests/:id/respond', DepartmentPortalController.respondToRequest);

// Format response
router.post('/requests/:id/format-response', DepartmentPortalController.formatResponse);

export default router;
