/**
 * CustodyTimerWorker.ts
 *
 * BullMQ worker that consumes 'custody-timer' jobs.
 *
 * When the delayed job fires (at warrant.custody_deadline):
 *  1. Calls WarrantService.handleCustodyDeadline() — writes 'custody_deadline_reached' DiaryEntry.
 *  2. Status stays 'in_custody' — the IO must take explicit action (produce / release).
 *
 * Start once in server.ts alongside other workers:
 *   import { startCustodyTimerWorker } from './shared/queue/CustodyTimerWorker';
 *   startCustodyTimerWorker();
 */

import { Job } from 'bullmq';
import { createWorker } from '../../config/bullmq';
import { CUSTODY_TIMER_QUEUE, CustodyTimerJobData } from './CustodyTimerQueue';
import logger from '../../config/logger';

export function startCustodyTimerWorker(): void {
  createWorker<CustodyTimerJobData>(
    CUSTODY_TIMER_QUEUE,
    async (job: Job<CustodyTimerJobData>) => {
      const { warrantId, caseId, participantId, participantName, custodyDeadline } = job.data;

      logger.info(
        `[CustodyTimerWorker] Deadline reached — warrant: ${warrantId}, ` +
        `participant: ${participantName} (${participantId}), ` +
        `case: ${caseId}, deadline: ${custodyDeadline}`,
      );

      // Lazy import to avoid circular dependency
      const { WarrantService } = await import('../../modules/investigation/services/warrantService');
      await WarrantService.handleCustodyDeadline(warrantId);
    },
    { concurrency: 5 },
  );

  logger.info('[CustodyTimerWorker] Custody timer worker started');
}
