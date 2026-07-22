/**
 * GmailPollQueue.ts
 *
 * Producer for the gmail-poll BullMQ queue.
 * Schedules a single repeatable job that fires every GMAIL_POLL_INTERVAL_MS.
 * The interval is read from env so it can be tuned without code changes.
 */

import { createQueue } from '../../config/bullmq';
import { QUEUE_NAMES } from '../constants/queue.constants';
import env from '../../config/env';
import logger from '../../config/logger';

export interface GmailPollJobData {
  /** Timestamp of when the job was scheduled — for logging only */
  scheduledAt: string;
}

const gmailPollQueue = createQueue<GmailPollJobData>(QUEUE_NAMES.GMAIL_POLL);

/**
 * Registers the repeatable poll job.
 * Safe to call multiple times — BullMQ deduplicates repeatable jobs by key.
 */
export async function scheduleGmailPollJob(): Promise<void> {
  const intervalMs = env.GMAIL_POLL_INTERVAL_MS;

  await gmailPollQueue.add(
    'poll',
    { scheduledAt: new Date().toISOString() },
    {
      repeat: { every: intervalMs },
      jobId:  'gmail-poll-repeatable', // fixed ID ensures only one repeatable job exists
    },
  );

  logger.info(`[GmailPollQueue] Repeatable poll job registered (interval: ${intervalMs}ms)`);
}

export { gmailPollQueue };
