import { Router } from 'express';
import { CaseParticipantController } from '../controllers/CaseParticipantController';

const router = Router();

// List all participants for a case
router.get('/:id/participants', CaseParticipantController.listCaseParticipants);

// Create a new participant manually
router.post('/:id/participants', CaseParticipantController.createParticipant);

// Approve an AI-suggested participant recommendation
router.post('/:id/participants/recommendations/approve', CaseParticipantController.approveRecommendation);

// Attach legal sections to a participant
router.post('/:id/participants/:participantId/sections/attach', CaseParticipantController.attachSections);

// Update an existing participant
router.patch('/:id/participants/:participantId', CaseParticipantController.updateParticipant);

// Delete a participant
router.delete('/:id/participants/:participantId', CaseParticipantController.deleteParticipant);

// Promote a participant from Suspect to Accused
router.patch('/:id/participants/:participantId/promote-to-accused', CaseParticipantController.promoteToAccused);

export default router;