import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

const TIMEOUT_MS = 300000; // 300s timeout to allow for first-time ONNX export

/**
 * Thin client wrapper for the legal_agent FastAPI service.
 * Handles timeouts and degrades gracefully rather than crashing.
 */
export async function callLegalAgent(query: string): Promise<Record<string, any>> {
  try {
    const response = await axios.post(
      `${env.LEGAL_AGENT_URL}/copilot`,
      { query },
      { timeout: TIMEOUT_MS }
    );
    return response.data;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('legal_agent call failed or timed out', { details: msg });
    
    // Circuit-breaker style fallback: return empty/flagged result
    return {
      _fallback_used: true,
      error: 'legal_agent unavailable',
      retrieved_chunks: [],
      legal_basis: []
    };
  }
}
