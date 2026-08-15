import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

const TIMEOUT_MS = 60000; // 60s timeout to allow for first-time model load if needed

export interface PromptCompressionRequest {
  text: string;
  rate?: number;
  force_tokens?: string[];
}

export interface PromptCompressionResponse {
  compressed_text: string;
  original_tokens: number;
  compressed_tokens: number;
}

/**
 * Thin client wrapper for the prompt_compression FastAPI service.
 * Handles timeouts, feature flag, and degrades gracefully by returning original text.
 */
export async function compressPrompt(
  text: string, 
  forceTokens: string[] = [], 
  rate: number = 0.5
): Promise<string> {
  // Graceful degradation / Feature toggle
  if (!env.PROMPT_COMPRESSION_ENABLED) {
    return text;
  }

  try {
    const payload: PromptCompressionRequest = {
      text,
      rate,
      force_tokens: forceTokens
    };

    const response = await axios.post<PromptCompressionResponse>(
      `${env.PROMPT_COMPRESSION_URL}/compress`,
      payload,
      { timeout: TIMEOUT_MS }
    );
    
    return response.data.compressed_text;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('prompt_compression call failed or timed out, falling back to uncompressed text', { details: msg });
    
    // Circuit-breaker style fallback: return original text
    return text;
  }
}
