import { createQueue } from '../../config/bullmq';
import { QUEUE_NAMES, FIR_JOB_NAMES } from '../constants/queue.constants';

export interface FirPdfJobData {
  type: typeof FIR_JOB_NAMES.GENERATE_FIR_PDF;
  payload: {
    complaintId: string;
  };
}

const firQueue = createQueue<FirPdfJobData>(QUEUE_NAMES.FIR);

/**
 * FIR queue producer.
 * Enqueues PDF generation jobs to be processed asynchronously by the FirWorker.
 */
export class FirQueue {
  static async enqueueGenerateFirPdf(complaintId: string): Promise<void> {
    await firQueue.add(FIR_JOB_NAMES.GENERATE_FIR_PDF, {
      type: FIR_JOB_NAMES.GENERATE_FIR_PDF,
      payload: { complaintId },
    });
  }
}
