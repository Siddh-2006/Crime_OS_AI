import { Job } from 'bullmq';
import { createWorker } from '../../config/bullmq';
import { QUEUE_NAMES, ANALYSIS_JOB_NAMES } from '../constants/queue.constants';
import type { AnalysisJobData } from './AnalysisQueue';
import { InvestigationOrchestrator } from '../../modules/investigation/services/investigationOrchestrator';
import logger from '../../config/logger';

export function startAnalysisWorker(): void {
  createWorker<AnalysisJobData>(QUEUE_NAMES.ANALYSIS, async (job: Job<AnalysisJobData>) => {
    logger.info(`[AnalysisWorker] Processing job ${job.name} (id: ${job.id})`);

    try {
      switch (job.name) {
        case ANALYSIS_JOB_NAMES.ANALYZE_CASE:
          await InvestigationOrchestrator.runAnalysis(job.data.caseId);
          break;
        default:
          logger.warn(`[AnalysisWorker] Unknown job name: ${job.name}`);
      }
    } catch (error) {
      logger.error(`[AnalysisWorker] Job ${job.name} failed`, { error });
      throw error;
    }
  });

  logger.info('[AnalysisWorker] Started');
}
