import { Job } from 'bullmq';
import { createWorker } from '../../config/bullmq';
import { QUEUE_NAMES, ANALYSIS_JOB_NAMES } from '../constants/queue.constants';
import type { AnalysisJobData } from './AnalysisQueue';
import { InvestigationOrchestrator } from '../../modules/investigation/services/investigationOrchestrator';
import logger from '../../config/logger';

export function startAnalysisWorker(): void {
  const worker = createWorker<AnalysisJobData>(
    QUEUE_NAMES.ANALYSIS,
    async (job: Job<AnalysisJobData>) => {
      logger.info(`[AnalysisWorker] ▶ Processing job ${job.name} (id: ${job.id}) for caseId: ${job.data.caseId}`);

      try {
        switch (job.name) {
          case ANALYSIS_JOB_NAMES.ANALYZE_CASE:
            await InvestigationOrchestrator.runAnalysis(job.data.caseId);
            break;
          default:
            logger.warn(`[AnalysisWorker] Unknown job name: ${job.name}`);
        }
        logger.info(`[AnalysisWorker] ✅ Job ${job.id} completed successfully for caseId: ${job.data.caseId}`);
      } catch (error: any) {
        logger.error(`[AnalysisWorker] ❌ Job ${job.id} FAILED for caseId: ${job.data.caseId}`, {
          error: error?.message,
          stack: error?.stack?.split('\n').slice(0, 5).join(' | '),
        });
        try {
          const { publishProgress } = await import('../utils/analysisProgress');
          await publishProgress(job.data.caseId, 'analysis_error', {
            error: `Analysis failed: ${error?.message ?? 'Unknown error'}`,
          });
        } catch { /* swallow */ }
        throw error;
      }
    },
    {
      concurrency: 1,
      // lockDuration must exceed the longest possible LLM call.
      // At 10 min timeout per call + 2 calls + overhead = 25 min to be safe.
      // BullMQ renews the lock every lockRenewTime ms, so we set that too.
      lockDuration:   25 * 60 * 1000,   // 25 minutes in ms
      lockRenewTime:   5 * 60 * 1000,   // renew every 5 minutes
    },
  );

  // Log when worker actually connects to Redis and is ready to process
  worker.on('ready', () => {
    logger.info('[AnalysisWorker] ✅ Worker connected to Redis and ready to process jobs');
  });

  worker.on('error', (err) => {
    logger.error('[AnalysisWorker] Worker connection error', { error: err.message });
  });

  logger.info('[AnalysisWorker] Started — listening for analyze_case jobs');
}

