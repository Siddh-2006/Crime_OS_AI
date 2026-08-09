/**
 * warrant.routes.ts
 *
 * All arrest warrant routes are nested under the investigation router,
 * which already applies:
 *   authenticate  — verifies JWT
 *   authorize(SHO, IO)  — blocks all other roles
 *
 * Route prefix (after mounting in investigation.routes.ts):
 *   /:id/warrants/...
 *
 * IMPORTANT: warrant.routes.ts uses mergeParams: true so that `:id`
 * (the caseId) from the parent investigation router is accessible inside
 * these handlers via req.params.id.
 */

import { Router } from 'express';
import { WarrantController } from '../controllers/WarrantController';

const router = Router({ mergeParams: true });

// ── List & create ─────────────────────────────────────────────────────────────
// GET  /:id/warrants[?participantId=<pid>]
router.get('/:id/warrants',                   WarrantController.listWarrants);

// POST /:id/warrants   — body: { participant_id, justification, warrant_draft_content? }
router.post('/:id/warrants',                  WarrantController.createWarrant);

// ── Single warrant ────────────────────────────────────────────────────────────
// GET   /:id/warrants/:warrantId
router.get('/:id/warrants/:warrantId',        WarrantController.getWarrant);

// PATCH /:id/warrants/:warrantId  — body: { justification?, warrant_draft_content? }
router.patch('/:id/warrants/:warrantId',      WarrantController.updateWarrant);

// ── State transitions ─────────────────────────────────────────────────────────
// POST /:id/warrants/:warrantId/send      draft → sent_to_magistrate
router.post('/:id/warrants/:warrantId/send',     WarrantController.sendToMagistrate);

// POST /:id/warrants/:warrantId/custody   approved → in_custody
router.post('/:id/warrants/:warrantId/custody',  WarrantController.takeIntoCustody);

// POST /:id/warrants/:warrantId/produced  in_custody → produced_before_court
router.post('/:id/warrants/:warrantId/produced', WarrantController.produceBeforeCourt);

// POST /:id/warrants/:warrantId/release   in_custody → released
router.post('/:id/warrants/:warrantId/release',  WarrantController.markReleased);

export default router;
