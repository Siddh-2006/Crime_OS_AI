import { Router } from 'express';
import { CaseParticipantController } from '../controllers/CaseParticipantController';

const router = Router();

router.get('/:id/participants', CaseParticipantController.listCaseParticipants);
router.post('/:id/participants/recommendations/approve', CaseParticipantController.approveRecommendation);
router.post('/:id/participants/:participantId/sections/attach', CaseParticipantController.attachSections);
router.patch('/:id/participants/:participantId/promote-to-accused', CaseParticipantController.promoteToAccused);

export default router;