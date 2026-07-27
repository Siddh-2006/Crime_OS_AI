import { Router } from 'express';
import multer from 'multer';
import { CitizenRequestController } from '../controllers/CitizenRequestController';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const router = Router();

// GET /api/v1/citizen-request/:token
router.get('/:token', CitizenRequestController.getRequestByToken);

// POST /api/v1/citizen-request/:token/response
router.post('/:token/response', upload.array('files'), CitizenRequestController.submitResponse);

export default router;
