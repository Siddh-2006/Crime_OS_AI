/**
 * ollamaClient.ts
 *
 * LLM client with automatic fallback:
 *
 *   PRIMARY  → Ollama (local)  running gemma4:e2b on port 11434
 *   FALLBACK → Gemini 2.5 Flash Lite (Google AI Studio) via @google/genai
 *
 * Fallback is triggered when Ollama throws any error (unreachable, timeout,
 * model not found, etc.). A single `logger.warn` is emitted per fallback call
 * so it's visible in the logs.
 *
 * Exports:
 *   fastCall  — temp 0.2, 512 tokens, thinking OFF (Ollama) / no thinking budget (Gemini)
 *   deepCall  — temp 0.1, 2048 tokens, thinking ON via <|think|> (Ollama) / 8192 thinking budget (Gemini)
 *
 * ── Sarvam / llama-server implementation — COMMENTED OUT ──────────────────────
 * See sarvamClient.ts for the Sarvam implementation (kept for reference / other
 * team members who may want to use it).
 */

import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';
import { geminifast, geminiDeep } from './geminiClient';

// ─── Public options type ──────────────────────────────────────────────────────

export interface OllamaCallOptions {
  /** Return parsed JSON object instead of raw string */
  jsonMode?: boolean;
  /** Override max tokens for this call */
  maxTokens?: number;
  /** Override temperature */
  temperature?: number;
}

// ─── Ollama API shapes ────────────────────────────────────────────────────────

interface OllamaGenerateRequest {
  model:   string;
  prompt:  string;
  system?: string;
  stream:  false;
  options: {
    temperature: number;
    num_predict: number;
    num_ctx:     number;
  };
}

interface OllamaGenerateResponse {
  response:           string;
  prompt_eval_count?: number;
  eval_count?:        number;
  total_duration?:    number; // nanoseconds
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FAST_MODEL    = env.OLLAMA_REQUIRED_MODELS.split(',')[0].trim(); // reads from env — stays in sync
const FAST_DEFAULTS = { temperature: 0.2, maxTokens: 512  };
const DEEP_DEFAULTS = { temperature: 0.1, maxTokens: 2048 };

// Gemma 4 chat-template control token that activates extended thinking
const THINK_TOKEN = '<|think|>';

// ─── Core Ollama request ──────────────────────────────────────────────────────

async function _ollamaCall(
  systemPrompt:  string,
  userPrompt:    string,
  temperature:   number,
  maxTokens:     number,
  thinkingMode:  boolean,
  options:       OllamaCallOptions = {},
): Promise<string> {
  const finalPrompt = thinkingMode ? `${THINK_TOKEN}\n${userPrompt}` : userPrompt;

  const body: OllamaGenerateRequest = {
    model:  FAST_MODEL,
    prompt: finalPrompt,
    system: systemPrompt,
    stream: false,
    options: {
      temperature: options.temperature ?? temperature,
      num_predict: options.maxTokens  ?? maxTokens,
      num_ctx:     env.OLLAMA_NUM_CTX,
    },
  };

  const t0 = Date.now();

  logger.debug('[ollama] Sending request', {
    model: FAST_MODEL,
    thinkingMode,
    temperature:  body.options.temperature,
    num_predict:  body.options.num_predict,
  });

  const res = await axios.post<OllamaGenerateResponse>(
    `${env.OLLAMA_BASE_URL}/api/generate`,
    body,
    { timeout: 120_000 },
  );

  const latencyMs = Date.now() - t0;
  const { response, prompt_eval_count, eval_count, total_duration } = res.data;

  logger.info('[ollama] Call complete', {
    model: FAST_MODEL,
    thinkingMode,
    latencyMs,
    promptTokens:     prompt_eval_count,
    completionTokens: eval_count,
    ollamaReportedMs: total_duration ? Math.round(total_duration / 1e6) : undefined,
  });

  return response.trim();
}

// ─── JSON helper (shared by both lanes) ──────────────────────────────────────

async function _ollamaCallJson(
  systemPrompt: string,
  userPrompt:   string,
  temperature:  number,
  maxTokens:    number,
  thinkingMode: boolean,
  options:      OllamaCallOptions,
): Promise<unknown> {
  const raw   = await _ollamaCall(systemPrompt, userPrompt, temperature, maxTokens, thinkingMode, options);
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(clean);
  } catch {
    logger.warn('[ollama] JSON parse failed — retrying with explicit reminder');
    const retryRaw   = await _ollamaCall(
      systemPrompt,
      `${userPrompt}\n\nIMPORTANT: Return valid JSON only. No markdown, no explanation.`,
      temperature, maxTokens, thinkingMode, options,
    );
    const retryClean = retryRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      return JSON.parse(retryClean);
    } catch (err) {
      logger.error('[ollama] JSON parse failed after retry', { raw: retryClean });
      throw new Error(`Ollama did not return valid JSON: ${(err as Error).message}`);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fast lane — thinking OFF, temp 0.2, 512 tokens.
 * Primary: Ollama (gemma4:e2b).  Fallback: Gemini 2.5 Flash Lite.
 */
export async function fastCall(
  systemPrompt: string,
  userPrompt:   string,
  options:      OllamaCallOptions = {},
): Promise<string | unknown> {
  try {
    if (options.jsonMode) {
      return await _ollamaCallJson(
        systemPrompt, userPrompt,
        FAST_DEFAULTS.temperature, FAST_DEFAULTS.maxTokens,
        false, options,
      );
    }
    return await _ollamaCall(
      systemPrompt, userPrompt,
      FAST_DEFAULTS.temperature, FAST_DEFAULTS.maxTokens,
      false, options,
    );
  } catch (ollamaErr: any) {
    logger.warn('[ollama] fastCall failed — falling back to Gemini 2.5 Flash Lite', {
      error: ollamaErr?.message,
      hint: 'Ensure Ollama is running: ollama serve',
    });
    return geminifast(systemPrompt, userPrompt, options);
  }
}

/**
 * Deep lane — thinking ON (<|think|>), temp 0.1, 2048 tokens.
 * Primary: Ollama (gemma4:e2b).  Fallback: Gemini 2.5 Flash Lite with thinking budget 8192.
 */
export async function deepCall(
  systemPrompt: string,
  userPrompt:   string,
  options:      OllamaCallOptions = {},
): Promise<string | unknown> {
  try {
    if (options.jsonMode) {
      return await _ollamaCallJson(
        systemPrompt, userPrompt,
        DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens,
        true, options,
      );
    }
    return await _ollamaCall(
      systemPrompt, userPrompt,
      DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens,
      true, options,
    );
  } catch (ollamaErr: any) {
    logger.warn('[ollama] deepCall failed — falling back to Gemini 2.5 Flash Lite (thinking budget: 8192)', {
      error: ollamaErr?.message,
      hint: 'Ensure Ollama is running: ollama serve',
    });
    return geminiDeep(systemPrompt, userPrompt, options);
  }
}

// ─── Sarvam / llama-server implementation — COMMENTED OUT ────────────────────
// Sarvam-1 was used temporarily while Ollama was unavailable.
// The full implementation is in sarvamClient.ts.
// To re-enable: import { fastCall, deepCall } from './sarvamClient' in callers.
//
// export type { LlmCallOptions as OllamaCallOptions } from './sarvamClient';
// export { fastCall, deepCall } from './sarvamClient';
