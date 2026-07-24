import { Router } from 'express';

const router = Router();

// Portal-based citizen response endpoints are disabled for email-only flow.
// GET /api/citizen-request/:token
// router.get('/:token', CitizenRequestController.getRequestByToken);

// POST /api/citizen-request/:token/response
// router.post('/:token/response', upload.array('files'), CitizenRequestController.submitResponse);

export default router;
