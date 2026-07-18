import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

const TIMEOUT_MS = 15000; // 15s timeout

/**
 * Thin client wrapper for the io-recommendation FastAPI service.
 * Handles timeouts and degrades gracefully so the orchestrator can continue.
 */
export async function callIoRecommendation(query: string): Promise<Record<string, any>> {
  try {
    const response = await axios.post(
      `${env.IO_RECOMMENDATION_URL}/recommend`,
      { query },
      { timeout: TIMEOUT_MS }
    );
    return response.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('io-recommendation call failed or timed out', { details: msg });
    
    // Circuit-breaker style fallback: return empty/flagged result
    return {
      _fallback_used: true,
      error: 'io-recommendation unavailable',
      similar_cases: [] // assuming the orchestrator expects something like this
    };
  }
}
