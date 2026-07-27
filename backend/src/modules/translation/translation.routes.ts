import { Router } from 'express';
import { authenticate } from '../../common/middlewares/authenticate.middleware';
import { translateBatch } from './translation.controller';

const router = Router();

router.post('/batch', authenticate, translateBatch);

export default router;
