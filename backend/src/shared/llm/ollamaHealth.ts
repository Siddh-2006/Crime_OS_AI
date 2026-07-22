/**
 * ollamaHealth.ts — repurposed as Sarvam health check.
 *
 * The original Ollama health check is preserved below (commented out).
 * `checkOllamaHealth` now verifies that the Sarvam llama-server is reachable
 * and responding to /v1/models. The export name is kept so server.ts needs
 * no changes.
 */

import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

// ─── Active: Sarvam / llama-server health check ───────────────────────────────

export async function checkOllamaHealth(): Promise<void> {
  const base  = env.SARVAM_BASE_URL;
  const model = env.SARVAM_MODEL;

  try {
    // llama-server exposes GET /v1/models (OpenAI-compatible)
    await axios.get(`${base}/v1/models`, { timeout: 5_000 });
  } catch {
    throw new Error(
      `[sarvam] Cannot reach llama-server at ${base}. ` +
      `Ensure it is running: llama-server -m sarvam-1.Q8_0.gguf -c 2048 --port 8004`,
    );
  }

  logger.info('[sarvam] Health check passed', {
    baseUrl: base,
    model,
    contextLimit: env.SARVAM_MAX_CTX,
    hint: env.SARVAM_MAX_CTX < 4096
      ? `Context window is ${env.SARVAM_MAX_CTX} tokens — deep analysis prompts may be truncated. ` +
        `Consider restarting llama-server with -c 4096 if RAM allows.`
      : undefined,
  });
}

// ─── OLD Ollama health check — COMMENTED OUT ─────────────────────────────────
//
// interface OllamaTagsResponse {
//   models: { name: string }[];
// }
//
// export async function checkOllamaHealth(): Promise<void> {
//   const base = env.OLLAMA_BASE_URL;
//   const required = env.OLLAMA_REQUIRED_MODELS.split(',').map((m) => m.trim());
//
//   try {
//     await axios.get(`${base}/api/tags`, { timeout: 5_000 });
//   } catch {
//     throw new Error(
//       `[ollama] Cannot reach Ollama at ${base}. ` +
//       `Ensure Ollama is running: https://ollama.com/download`,
//     );
//   }
//
//   const { data } = await axios.get<OllamaTagsResponse>(`${base}/api/tags`, { timeout: 5_000 });
//   const pulled = new Set(data.models.map((m) => m.name));
//   const missing = required.filter((m) => !pulled.has(m));
//   if (missing.length > 0) {
//     throw new Error(
//       `[ollama] Required model(s) not pulled: ${missing.join(', ')}. ` +
//       `Run: ${missing.map((m) => `ollama pull ${m}`).join(' && ')}`,
//     );
//   }
//   logger.info('[ollama] Health check passed', { models: required });
// }
