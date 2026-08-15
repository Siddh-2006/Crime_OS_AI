import axios from 'axios';
import logger from '../../../config/logger';
import env from '../../../config/env';

export class SightEngineService {
  static async evaluateConfidence(file: {
    secureUrl?: string;
    url?: string;
    resourceType?: string;
    mimeType?: string;
    originalFilename?: string;
  }, context?: {
    source?: string;
    evidenceId?: string;
    caseId?: string;
  }): Promise<number> {
    const enabled = env.SIGHTENGINE_ENABLE_DEEPFAKE_CHECK !== false;
    const apiUser = env.SIGHTENGINE_API_USER?.trim();
    const apiSecret = env.SIGHTENGINE_API_KEY?.trim();
    const targetUrl = file?.secureUrl || file?.url;
    const filename = file?.originalFilename || 'unknown';
    const source = context?.source || 'unknown';
    const evidenceId = context?.evidenceId || 'unknown';
    const caseId = context?.caseId || 'unknown';

    if (!enabled || !apiUser || !apiSecret || !targetUrl) {
      logger.debug('[confidence score] Skipped (disabled or missing config)', {
        filename,
        source,
        evidenceId,
        caseId,
      });
      return 0;
    }

    try {
      logger.info('[confidence score] Evaluating evidence', {
        filename,
        source,
        evidenceId,
        caseId,
        url: targetUrl,
      });

      const response = await axios.post(
        'https://api.sightengine.com/1.0/check.json',
        new URLSearchParams({
          api_user: apiUser,
          api_secret: apiSecret,
          models: 'deepfake',
          url: targetUrl,
        }).toString(),
        {
          timeout: env.SIGHTENGINE_TIMEOUT_MS || 30000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const payload = response?.data ?? {};
      const deepfake = payload?.data?.deepfake ?? payload?.deepfake ?? payload?.data ?? {};
      const rawScore = Number(
        deepfake?.probability ??
        deepfake?.score ??
        deepfake?.confidence ??
        deepfake?.fake ??
        payload?.probability ??
        payload?.score ??
        0
      );

      const normalized = Number.isFinite(rawScore) ? rawScore * 100 : 0;
      const finalScore = Math.max(0, Math.min(100, normalized));

      logger.info('[confidence score] Evaluation complete', {
        filename,
        source,
        evidenceId,
        caseId,
        score: finalScore,
        label: finalScore < 30 ? 'likely real' : finalScore < 70 ? 'uncertain' : 'likely AI',
      });

      return finalScore;
    } catch (error: any) {
      logger.warn('[confidence score] Evaluation failed', {
        filename,
        source,
        evidenceId,
        caseId,
        error: error?.message,
      });
      return 0;
    }
  }
}
