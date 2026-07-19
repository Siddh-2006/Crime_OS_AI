import { createQueue } from '../../config/bullmq';
import { QUEUE_NAMES, ANALYSIS_JOB_NAMES } from '../constants/queue.constants';
import logger from '../../config/logger';

export interface AnalysisJobData {
  caseId: string;
}

const analysisQueue = createQueue<AnalysisJobData>(QUEUE_NAMES.ANALYSIS);

export class AnalysisQueue {
  /**
   * Enqueues an analysis job for a given case.
   */
  static async enqueueAnalyzeCase(caseId: string): Promise<void> {
    try {
      await analysisQueue.add(ANALYSIS_JOB_NAMES.ANALYZE_CASE, { caseId }, {
        attempts: 1, // Fail fast on AI calls rather than infinitely retrying
        removeOnComplete: true,
      });
      logger.info(`Enqueued analyze_case job for caseId: ${caseId}`);
    } catch (err) {
      logger.error(`Failed to enqueue analyze_case job for caseId: ${caseId}`, { error: err });
      throw err;
    }
  }
}
