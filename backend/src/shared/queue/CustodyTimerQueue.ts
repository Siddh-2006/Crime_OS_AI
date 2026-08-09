/**
 * CustodyTimerQueue.ts
 *
 * BullMQ producer for the 24-hour BNSS §57 custody deadline timer.
 *
 * When WarrantService.takeIntoCustody() sets warrant.custody_deadline,
 * it enqueues a delayed job here. The job fires exactly at the deadline
 * and calls WarrantService.handleCustodyDeadline() to write a DiaryEntry
 * and flag the case for IO / SHO attention.
 *
 * Queue name: 'custody-timer'
 * Concurrency: 5 (CPU-light — just one DB write per job)
 */

import { createQueue } from '../../config/bullmq';

export const CUSTODY_TIMER_QUEUE = 'custody-timer';

export interface CustodyTimerJobData {
  caseId:          string;
  warrantId:       string;
  participantId:   string;
  participantName: string;
  custodyDeadline: string;   // ISO 8601 UTC string
}

const custodyTimerQueue = createQueue<CustodyTimerJobData>(CUSTODY_TIMER_QUEUE);

export class CustodyTimerQueue {
  /**
   * Enqueues a delayed job that fires at `custodyDeadline`.
   * Uses the warrant_id as the BullMQ job ID for deduplication —
   * re-enqueueing the same warrant_id is a no-op.
   *
   * @param data  Job payload containing all IDs needed by the worker.
   */
  static async enqueue(data: CustodyTimerJobData): Promise<void> {
    const deadline   = new Date(data.custodyDeadline);
    const delayMs    = Math.max(0, deadline.getTime() - Date.now());

    await custodyTimerQueue.add(
      'custody-deadline',
      data,
      {
        jobId: `custody-timer-${data.warrantId}`,  // deduplication key
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'fixed', delay: 30_000 },  // retry after 30 s
        removeOnComplete: 50,
        removeOnFail:     200,
      },
    );
  }
}
