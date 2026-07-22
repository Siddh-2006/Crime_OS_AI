import { Router } from 'express';
import { InvestigationController } from '../controllers/InvestigationController';
import { CitizenRequestController } from '../controllers/CitizenRequestController';
import caseParticipantRoutes from './caseParticipant.routes';
import chargeSheetRoutes from './chargeSheet.routes';
import { DepartmentRegistry } from '../../admin/models/DepartmentRegistry.model';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import { authorize } from '../../../common/middlewares/authorize.middleware';
import { Role } from '../../../shared/enums/roles.enum';

const router = Router();

router.use(authenticate, authorize(Role.SHO, Role.IO));

router.use(caseParticipantRoutes);
router.use(chargeSheetRoutes);

// Endpoint to trigger async analysis
router.post('/:id/analyze', InvestigationController.analyzeCase);

// Public department list (used by IO for request composer)
router.get('/departments', async (_req, res) => {
  try {
    const depts = await DepartmentRegistry.find({ isActive: true }, { entity_id: 1, entity_name: 1, category: 1 }).sort({ entity_name: 1 }).lean();
    res.json({ success: true, data: depts });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to fetch departments' });
  }
});

// Copilot
router.post('/:id/copilot/ask', InvestigationController.askCopilot);

// Endpoint to get the latest analysis snapshot
router.get('/:id/analysis/latest', InvestigationController.getLatestSnapshot);
router.get('/:id/analysis/:snapshotId', InvestigationController.getSnapshotById);

// Officer manual overrides
router.post('/:id/analysis/:snapshotId/correct', InvestigationController.correctSnapshot);
router.post('/:id/analysis/manual', InvestigationController.createManualSnapshot);

// Request Composer endpoints
router.post('/:id/requests/draft', InvestigationController.generateDraftRequest);
router.patch('/:id/requests/:reqId', InvestigationController.updateRequestDraft);
router.post('/:id/requests/:reqId/send', InvestigationController.sendRequest);
router.post('/:id/citizen-request', CitizenRequestController.createCitizenRequest);

// Escalation
router.post('/:id/escalate', InvestigationController.escalateCase);

// State fetchers
router.get('/:id/diary', InvestigationController.getCaseDiary);
router.get('/:id/checklist', InvestigationController.getCaseChecklist);
router.post('/:id/checklist/steps', InvestigationController.addManualStep);
router.post('/:id/checklist/:stepId/complete', InvestigationController.completeStep);
router.get('/:id/requests', InvestigationController.getDepartmentRequests);
router.get('/:id/evidence', InvestigationController.getEvidence);
router.post('/:id/evidence', InvestigationController.addEvidence);
router.post('/:id/evidence/:evidenceId/transfer', InvestigationController.transferEvidence);

// Thread endpoints
router.get('/:id/threads', InvestigationController.getThreads);
router.get('/threads/:threadId', InvestigationController.getThreadById);
router.post('/threads/:threadId/reply', InvestigationController.replyToThread);
router.post('/threads/:threadId/format-response', InvestigationController.formatThreadResponse);
router.post('/:id/threads/:thread_id/export-pdf', InvestigationController.exportThreadToPdf);

export default router;
