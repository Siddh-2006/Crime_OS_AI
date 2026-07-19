import { Router } from 'express';
import { DepartmentPortalController } from '../controllers/DepartmentPortalController';

const router = Router();

// Mock Auth
router.post('/login', DepartmentPortalController.login);

// Fetch requests
router.get('/inbox', DepartmentPortalController.getInbox);

// Submit response (Phase 8 Ingestion)
router.post('/requests/:id/respond', DepartmentPortalController.respondToRequest);

export default router;
