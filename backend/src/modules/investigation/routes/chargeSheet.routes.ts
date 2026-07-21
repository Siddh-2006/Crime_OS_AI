import { Router } from 'express';
import { ChargeSheetController } from '../controllers/ChargeSheetController';

const router = Router();

router.get('/:id/chargesheet', ChargeSheetController.getChargeSheet);

export default router;