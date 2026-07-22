/**
 * ollamaHealth.ts
 *
 * Startup health check for Ollama (primary LLM).
 * Checks that Ollama is reachable and the required model is pulled.
 *
 * If Ollama is unreachable, the server still boots — all LLM calls will
 * automatically fall back to Gemini (see geminiClient.ts).
 *
 * ── Sarvam health check — COMMENTED OUT ──────────────────────────────────────
 * See bottom of file.
 */

import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

interface OllamaTagsResponse {
  models: { name: string }[];
}

export async function checkOllamaHealth(): Promise<void> {
  const base     = env.OLLAMA_BASE_URL;
  const required = env.OLLAMA_REQUIRED_MODELS.split(',').map((m) => m.trim());

  // 1. Ping — is Ollama running?
  try {
    await axios.get(`${base}/api/tags`, { timeout: 5_000 });
  } catch {
    throw new Error(
      `[ollama] Cannot reach Ollama at ${base}. ` +
      `LLM calls will fall back to Gemini (cloud). ` +
      `To use local models: https://ollama.com/download`,
    );
  }

  // 2. Check required models are pulled
  const { data } = await axios.get<OllamaTagsResponse>(`${base}/api/tags`, { timeout: 5_000 });
  const pulled   = new Set(data.models.map((m) => m.name));
  const missing  = required.filter((m) => !pulled.has(m));

  if (missing.length > 0) {
    throw new Error(
      `[ollama] Required model(s) not pulled: ${missing.join(', ')}. ` +
      `LLM calls will fall back to Gemini (cloud). ` +
      `To pull locally: ${missing.map((m) => `ollama pull ${m}`).join(' && ')}`,
    );
  }

  const geminiStatus = env.GEMINI_API_KEY
    ? 'Gemini fallback: configured'
    : 'Gemini fallback: NOT configured (set GEMINI_API_KEY)';

  logger.info('[ollama] Health check passed', { models: required, geminiStatus });
}

// ─── Sarvam / llama-server health check — COMMENTED OUT ──────────────────────
//
// export async function checkOllamaHealth(): Promise<void> {
//   const base  = env.SARVAM_BASE_URL;
//   const model = env.SARVAM_MODEL;
//   try {
//     await axios.get(`${base}/v1/models`, { timeout: 5_000 });
//   } catch {
//     throw new Error(
//       `[sarvam] Cannot reach llama-server at ${base}. ` +
//       `Ensure it is running: llama-server -m sarvam-1.Q8_0.gguf -c 2048 --port 8004`,
//     );
//   }
//   logger.info('[sarvam] Health check passed', {
//     baseUrl: base, model, contextLimit: env.SARVAM_MAX_CTX,
//   });
// }
