/**
 * analysisProgress.ts
 *
 * Thin Redis pub/sub wrapper for broadcasting analysis pipeline progress
 * from the BullMQ worker to SSE clients connected to the API server.
 *
 * Channel key: analysis:progress:<caseId>
 *
 * Message shape (JSON):
 * {
 *   stage:   string   — machine key (e.g. "facts_assembled")
 *   label:   string   — plain-English label shown to the officer
 *   pct:     number   — 0–100 progress percentage
 *   done?:   true     — present only on the final event
 *   error?:  string   — present only if the job failed
 * }
 */

import { getRedisClient } from '../../config/redis';
import logger from '../../config/logger';

// ─── Stage definitions ─────────────────────────────────────────────────────
// Each stage has a key, an officer-friendly label, and a percentage.
// Labels are intentionally written for non-technical users.

export interface ProgressStage {
  stage: string;
  label: string;
  pct:   number;
  done?: boolean;
  error?: string;
}

export const ANALYSIS_STAGES: Record<string, ProgressStage> = {
  queued: {
    stage: 'queued',
    label: 'Analysis request received — job is in queue',
    pct: 5,
  },
  facts_assembled: {
    stage: 'facts_assembled',
    label: 'Gathering case details — reading evidence, checklist steps, diary entries',
    pct: 18,
  },
  legal_retrieved: {
    stage: 'legal_retrieved',
    label: 'Searching legal database — finding matching laws (BNS/BNSS) and SOPs',
    pct: 35,
  },
  confidence_scored: {
    stage: 'confidence_scored',
    label: 'Calculating case strength — measuring how much evidence and checklist progress exists',
    pct: 50,
  },
  fast_pass_done: {
    stage: 'fast_pass_done',
    label: 'Quick scan complete — AI summarised what changed since last analysis',
    pct: 65,
  },
  deep_pass_done: {
    stage: 'deep_pass_done',
    label: 'Deep reasoning done — AI ranked next steps, identified suspects, suggested legal sections',
    pct: 85,
  },
  persisted: {
    stage: 'persisted',
    label: 'Saving results — storing analysis snapshot and updating case diary',
    pct: 95,
  },
  done: {
    stage: 'done',
    label: 'Analysis complete — results are ready',
    pct: 100,
    done: true,
  },
  analysis_error: {
    stage: 'analysis_error',
    label: 'Analysis failed — please try again',
    pct: 0,
    error: 'Analysis failed',
  },
};

function channelKey(caseId: string): string {
  return `analysis:progress:${caseId}`;
}

// ─── Publisher (called from the worker process) ────────────────────────────

export async function publishProgress(
  caseId: string,
  stageKey: keyof typeof ANALYSIS_STAGES,
  extra?: Partial<ProgressStage>,
): Promise<void> {
  try {
    const redis = getRedisClient();
    const stage = { ...ANALYSIS_STAGES[stageKey], ...extra };
    const payload = JSON.stringify(stage);

    // Publish to subscribers (SSE clients)
    await redis.publish(channelKey(caseId), payload);

    // Also store last known stage so the status endpoint can recover on page reload.
    // TTL: 10 minutes — enough to survive a browser refresh during analysis.
    // Clear it when done so the status endpoint falls back to snapshot check.
    if (stage.done || stage.error) {
      await redis.del(`analysis:status:${caseId}`);
    } else {
      await redis.setex(`analysis:status:${caseId}`, 600, payload);
    }

    logger.debug(`[AnalysisProgress] Published stage "${stageKey}" for case ${caseId}`);
  } catch (err: any) {
    logger.warn(`[AnalysisProgress] Failed to publish stage "${stageKey}"`, { error: err.message });
  }
}

// ─── Subscriber (called from the SSE endpoint in the API server) ───────────

/**
 * Subscribe to progress events for a case.
 * Returns an unsubscribe function — call it when the SSE client disconnects.
 *
 * Uses a DEDICATED Redis client per subscription (ioredis subscribers cannot
 * issue commands on the same connection while subscribed).
 */
export function subscribeProgress(
  caseId: string,
  onMessage: (stage: ProgressStage) => void,
): () => void {
  // Create a dedicated subscriber connection (cannot reuse the shared client)
  const { Redis } = require('ioredis');
  const env = require('../../config/env').default;

  const subscriber = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }) as import('ioredis').Redis;

  const channel = channelKey(caseId);

  subscriber.subscribe(channel, (err) => {
    if (err) {
      logger.error(`[AnalysisProgress] Subscribe failed for ${channel}`, { error: err.message });
    } else {
      logger.debug(`[AnalysisProgress] Subscribed to ${channel}`);
    }
  });

  subscriber.on('message', (_ch: string, message: string) => {
    try {
      const parsed: ProgressStage = JSON.parse(message);
      onMessage(parsed);
    } catch {
      logger.warn('[AnalysisProgress] Received unparseable message', { message });
    }
  });

  // Return unsubscribe cleanup
  return () => {
    subscriber.unsubscribe(channel).catch(() => {});
    subscriber.quit().catch(() => {});
    logger.debug(`[AnalysisProgress] Unsubscribed from ${channel}`);
  };
}
