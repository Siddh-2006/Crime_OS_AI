/**
 * Startup health check for Ollama.
 * Pings the Ollama REST API and confirms all required models are pulled locally.
 * Called from server.ts before the HTTP server starts.
 * Throws loudly if Ollama is unreachable or a required model is missing.
 */

import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

interface OllamaTagsResponse {
  models: { name: string }[];
}

export async function checkOllamaHealth(): Promise<void> {
  const base = env.OLLAMA_BASE_URL;
  const required = env.OLLAMA_REQUIRED_MODELS.split(',').map((m) => m.trim());

  // 1. Ping — is Ollama running?
  try {
    await axios.get(`${base}/api/tags`, { timeout: 5_000 });
  } catch {
    throw new Error(
      `[ollama] Cannot reach Ollama at ${base}. ` +
      `Ensure Ollama is running: https://ollama.com/download`,
    );
  }

  // 2. Check required models are pulled
  const { data } = await axios.get<OllamaTagsResponse>(`${base}/api/tags`, { timeout: 5_000 });
  const pulled = new Set(data.models.map((m) => m.name));

  const missing = required.filter((m) => !pulled.has(m));
  if (missing.length > 0) {
    throw new Error(
      `[ollama] Required model(s) not pulled: ${missing.join(', ')}. ` +
      `Run: ${missing.map((m) => `ollama pull ${m}`).join(' && ')}`,
    );
  }

  logger.info('[ollama] Health check passed', { models: required });
}
