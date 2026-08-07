import { createQueue } from '../../config/bullmq';
import { QUEUE_NAMES, CASE_DIARY_JOB_NAMES } from '../constants/queue.constants';

export interface CaseDiaryPdfJobData {
  diaryId: string;
  caseId: string;
}

const caseDiaryQueue = createQueue<CaseDiaryPdfJobData>(QUEUE_NAMES.CASE_DIARY);

export class CaseDiaryQueue {
  static async enqueuePdfGeneration(diaryId: string, caseId: string): Promise<void> {
    await caseDiaryQueue.add(CASE_DIARY_JOB_NAMES.GENERATE_PDF, {
      diaryId,
      caseId,
    });
  }
}
