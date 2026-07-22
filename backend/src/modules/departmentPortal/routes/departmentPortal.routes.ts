/**
 * Department Portal routes — DISABLED.
 * Replaced by email-based flow: GmailService polls for department email replies.
 * Routes are commented out to preserve the code but make all endpoints inaccessible.
 */
import { Router } from 'express';
// import { DepartmentPortalController } from '../controllers/DepartmentPortalController';

const router = Router();

// POST /login             — DISABLED (departments no longer log in via portal)
// router.post('/login', DepartmentPortalController.login);

// GET  /inbox             — DISABLED
// router.get('/inbox', DepartmentPortalController.getInbox);

// POST /requests/:id/respond — DISABLED (responses now come via email, ingested by GmailPollWorker)
// router.post('/requests/:id/respond', DepartmentPortalController.respondToRequest);

// POST /upload-signature  — DISABLED
// router.post('/upload-signature', DepartmentPortalController.getUploadSignature);

// POST /requests/:id/format-response — DISABLED
// router.post('/requests/:id/format-response', DepartmentPortalController.formatResponse);

export default router;
