import { Router } from 'express';
import multer from 'multer';
import { CaseParticipantController } from '../controllers/CaseParticipantController';

const router = Router();

// Memory-only multer for audio transcription — file never written to disk
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max (matches Python service)
});

// List all participants for a case
router.get('/:id/participants', CaseParticipantController.listCaseParticipants);

// Create a new participant manually
router.post('/:id/participants', CaseParticipantController.createParticipant);

// Approve an AI-suggested participant recommendation
router.post('/:id/participants/recommendations/approve', CaseParticipantController.approveRecommendation);

// Attach legal sections to a participant
router.post('/:id/participants/:participantId/sections/attach', CaseParticipantController.attachSections);

// Statements
router.post('/:id/participants/:participantId/statements', CaseParticipantController.addStatement);
router.delete('/:id/participants/:participantId/statements/:statementId', CaseParticipantController.deleteStatement);

// Audio → transcript (no audio persisted — returns text only)
router.post(
  '/:id/participants/:participantId/statements/transcribe',
  audioUpload.single('file'),
  CaseParticipantController.transcribeStatementAudio,
);

// Reasoning
router.post('/:id/participants/:participantId/reasoning', CaseParticipantController.addReasoning);
router.patch('/:id/participants/:participantId/reasoning/:reasoningId', CaseParticipantController.updateReasoning);
router.delete('/:id/participants/:participantId/reasoning/:reasoningId', CaseParticipantController.deleteReasoning);

// Update an existing participant
router.patch('/:id/participants/:participantId', CaseParticipantController.updateParticipant);

// Delete a participant
router.delete('/:id/participants/:participantId', CaseParticipantController.deleteParticipant);

// Promote a participant from Suspect to Accused
router.patch('/:id/participants/:participantId/promote-to-accused', CaseParticipantController.promoteToAccused);

export default router;