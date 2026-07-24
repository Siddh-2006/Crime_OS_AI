import { Router } from 'express';
import { CaseUnderstandingController } from '../controllers/CaseUnderstandingController';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import { authorize } from '../../../common/middlewares/authorize.middleware';
import { Role } from '../../../shared/enums/roles.enum';

const router = Router();
const controller = new CaseUnderstandingController();

/**
 * GET /api/v1/case-understanding/:id
 * Returns the full 9-section Case Understanding for a given complaint _id.
 * Accessible by Citizens (for their own complaints), SHO, and IO.
 */
router.get(
  '/:id',
  authenticate,
  authorize(Role.USER, Role.SHO, Role.IO),
  controller.getCaseUnderstanding,
);

export default router;
