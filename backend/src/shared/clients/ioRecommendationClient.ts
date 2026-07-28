import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

const TIMEOUT_MS = 15000; // 15s timeout

/**
 * Handles timeouts and degrades gracefully so the orchestrator can continue.
 */
export async function callIoRecommendation(query: any): Promise<Record<string, any>> {
  try {
    // The Python io-recommendation service expects a complex RecommendOfficersRequest
    // (with complaint and availableOfficers). If the orchestrator is passing a simple
    // string query to find similar cases, the Python endpoint will reject it with a 422.
    // For now, bypass the call for simple string queries to avoid the 422 error log.
    if (typeof query === 'string') {
       throw new Error('Not implemented: The Python service does not yet support string-based similar case search.');
    }

    const response = await axios.post(
      `${env.IO_RECOMMENDATION_URL}/recommend-officers`,
      query, // Assuming when it's not a string, it's the correct RecommendOfficersRequest payload
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
