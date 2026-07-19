import { Router } from 'express';
import { CitizenRequestController } from '../controllers/CitizenRequestController';
import multer from 'multer';

// Use memory storage for quick uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// GET /api/citizen-request/:token
router.get('/:token', CitizenRequestController.getRequestByToken);

// POST /api/citizen-request/:token/response
router.post('/:token/response', upload.array('files'), CitizenRequestController.submitResponse);

export default router;
