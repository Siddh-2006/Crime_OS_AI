/**
 * GmailPollWorker.ts
 *
 * BullMQ worker that processes gmail-poll jobs.
 * Each job execution calls GmailService.pollAndIngestReplies() which:
 *   - Fetches unread emails from the police Gmail inbox
 *   - Parses "Complaint ID:" from the body
 *   - Downloads + uploads attachments to Cloudinary
 *   - Ingests response into the investigation workflow
 *   - Marks emails as read (idempotency guard)
 *
 * Worker concurrency is 1 — polls must not overlap.
 * Never import this from routes or controllers; start it once in server.ts.
 */

import { Job } from 'bullmq';
import { createWorker } from '../../config/bullmq';
import { QUEUE_NAMES } from '../constants/queue.constants';
import { GmailService } from '../services/gmail/GmailService';
import { scheduleGmailPollJob, GmailPollJobData } from './GmailPollQueue';
import logger from '../../config/logger';

export function startGmailPollWorker(): void {
  // Register the repeatable job first
  scheduleGmailPollJob().catch((err) => {
    logger.error('[GmailPollWorker] Failed to schedule repeatable poll job', { error: err.message });
  });

  createWorker<GmailPollJobData>(
    QUEUE_NAMES.GMAIL_POLL,
    async (_job: Job<GmailPollJobData>) => {
      await GmailService.pollAndIngestReplies();
    },
    { concurrency: 1 }, // never run two polls simultaneously
  );

  logger.info('[GmailPollWorker] Gmail poll worker started');
}
