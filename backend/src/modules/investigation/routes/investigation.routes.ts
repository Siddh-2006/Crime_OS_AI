import { Router } from 'express';
import { InvestigationController } from '../controllers/InvestigationController';
import { CitizenRequestController } from '../controllers/CitizenRequestController';
import caseParticipantRoutes from './caseParticipant.routes';
import chargeSheetRoutes from './chargeSheet.routes';
import warrantRoutes from './warrant.routes';
import { DepartmentRegistry } from '../../admin/models/DepartmentRegistry.model';
import { authenticate } from '../../../common/middlewares/authenticate.middleware';
import { authorize } from '../../../common/middlewares/authorize.middleware';
import { Role } from '../../../shared/enums/roles.enum';

const router = Router();

router.use(authenticate, authorize(Role.SHO, Role.IO));

router.use(caseParticipantRoutes);
router.use(chargeSheetRoutes);
router.use(warrantRoutes);

// ── STATIC routes — MUST be registered before /:id dynamic routes ─────────────
// Express matches routes top-down; a dynamic /:id would capture 'departments'
// and 'threads' as caseIds if registered first.

// Department list (IO uses this in the request composer dropdown)
router.get('/departments', async (_req, res) => {
  try {
    const depts = await DepartmentRegistry
      .find({ isActive: true }, { entity_id: 1, entity_name: 1, category: 1 })
      .sort({ entity_name: 1 })
      .lean();
    res.json({ success: true, data: depts });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to fetch departments' });
  }
});

// Thread endpoints — /threads prefix must precede /:id
router.get('/threads/:threadId',             InvestigationController.getThreadById);
router.post('/threads/:threadId/reply',      InvestigationController.replyToThread);
router.post('/threads/:threadId/format-response', InvestigationController.formatThreadResponse);

// ── DYNAMIC /:id routes ────────────────────────────────────────────────────────

// Analysis
router.post('/:id/analyze',                  InvestigationController.analyzeCase);
router.get('/:id/analysis/progress',         InvestigationController.streamAnalysisProgress); // SSE
router.get('/:id/analysis/status',           InvestigationController.getAnalysisStatus);       // state-recovery
router.get('/:id/analysis/latest',           InvestigationController.getLatestSnapshot);
router.get('/:id/analysis/:snapshotId',      InvestigationController.getSnapshotById);
router.post('/:id/analysis/:snapshotId/correct', InvestigationController.correctSnapshot);
router.post('/:id/analysis/manual',          InvestigationController.createManualSnapshot);

// Copilot
router.post('/:id/copilot/ask',              InvestigationController.askCopilot);

// Request Composer
router.post('/:id/requests/draft',           InvestigationController.generateDraftRequest);
router.patch('/:id/requests/:reqId',         InvestigationController.updateRequestDraft);
router.post('/:id/requests/:reqId/send',     InvestigationController.sendRequest);

// Citizen requests
router.post('/:id/citizen-request/missing-info',  CitizenRequestController.requestFromMissingInfo);
router.post('/:id/citizen-request',               CitizenRequestController.createCitizenRequest);


// Escalation
router.post('/:id/escalate',                 InvestigationController.escalateCase);

// State fetchers
router.get('/:id/diary/history',             InvestigationController.getCaseDiaryHistory);
router.get('/:id/diary/places',              InvestigationController.getCaseDiaryPlaces);
router.get('/:id/diary',                     InvestigationController.getCaseDiary);
router.post('/:id/diary/draft',               InvestigationController.generateDiaryDraft);
router.put('/:id/diary/draft/:diaryId',       InvestigationController.updateDiaryDraft);
router.post('/:id/diary/finalize',            InvestigationController.finalizeDiaryDraft);
router.post('/:id/diary/places',              InvestigationController.addDiaryPlaceVisited);
router.post('/:id/diary/witnesses',          InvestigationController.addDiaryWitness);
router.get('/:id/checklist',                 InvestigationController.getCaseChecklist);
router.post('/:id/checklist/steps',          InvestigationController.addManualStep);
router.post('/:id/checklist/:stepId/complete', InvestigationController.completeStep);
router.get('/:id/requests',                  InvestigationController.getDepartmentRequests);
router.get('/:id/evidence',                  InvestigationController.getEvidence);
router.post('/:id/evidence',                 InvestigationController.addEvidence);
router.post('/:id/evidence/:evidenceId/sections/attach', InvestigationController.attachEvidenceSections);
router.post('/:id/evidence/:evidenceId/transfer', InvestigationController.transferEvidence);

// Per-case thread list (distinct from /threads/:threadId above)
router.get('/:id/threads',                   InvestigationController.getThreads);
router.post('/:id/threads/:thread_id/export-pdf', InvestigationController.exportThreadToPdf);

export default router;
