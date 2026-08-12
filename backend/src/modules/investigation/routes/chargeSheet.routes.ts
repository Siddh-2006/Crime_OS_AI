import { Router } from 'express';
import { ChargeSheetController } from '../controllers/ChargeSheetController';

const router = Router();

router.get('/:id/chargesheet', ChargeSheetController.getChargeSheet);
router.post('/:id/chargesheet/regenerate', ChargeSheetController.regenerateChargeSheet);
router.post('/:id/chargesheet/pdf', ChargeSheetController.generateChargeSheetPdf);
router.get('/:id/chargesheet/pdf', ChargeSheetController.downloadChargeSheetPdf);

export default router;