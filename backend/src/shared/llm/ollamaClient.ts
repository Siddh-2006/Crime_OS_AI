/**
 * Ollama local LLM client for Crime OS backend.
 *
 * Exports:
 *   fastCall  — gemma4:e4b, thinking OFF, low-temp, short output
 *   deepCall  — gemma4:e4b, thinking ON  (<|think|> prepended), minimal temp
 *
 * Both accept separate system/user prompts, support structured JSON output
 * (with one automatic retry on parse failure), and log latency + token counts.
 */

import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';
// import { GoogleGenAI } from '@google/genai';

// const ai = new GoogleGenAI({
//   apiKey: process.env.GEMINI_API_KEY,
// });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OllamaCallOptions {
  /** Return parsed JSON object instead of raw string */
  jsonMode?: boolean;
  /** Override max tokens for this call */
  maxTokens?: number;
  /** Override temperature */
  temperature?: number;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream: false;
  options: {
    temperature: number;
    num_predict: number;
    num_ctx: number;
  };
}

interface OllamaGenerateResponse {
  response: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number; // nanoseconds
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FAST_MODEL = 'gemma4:e2b';
const FAST_DEFAULTS = { temperature: 0.2, maxTokens: 512 };
const DEEP_DEFAULTS = { temperature: 0.1, maxTokens: 2048 };

// Gemma 4 chat-template control token that activates thinking mode
const THINK_TOKEN = '<|think|>';

// ─── Core request ─────────────────────────────────────────────────────────────

async function _call(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  thinkingMode: boolean,
  options: OllamaCallOptions = {},
): Promise<string> {
  const finalPrompt = thinkingMode ? `${THINK_TOKEN}\n${userPrompt}` : userPrompt;

  const body: OllamaGenerateRequest = {
    model: FAST_MODEL,
    prompt: finalPrompt,
    system: systemPrompt,
    stream: false,
    options: {
      temperature: options.temperature ?? temperature,
      num_predict: options.maxTokens ?? maxTokens,
      num_ctx: env.OLLAMA_NUM_CTX,
    },
  };

  const t0 = Date.now();
  const res = await axios.post<OllamaGenerateResponse>(
    `${env.OLLAMA_BASE_URL}/api/generate`,
    body,
    { timeout: 120_000 },
  );
  const latencyMs = Date.now() - t0;

  const { response, prompt_eval_count, eval_count, total_duration } = res.data;

  logger.debug('[ollama] call complete', {
    model: FAST_MODEL,
    thinkingMode,
    latencyMs,
    promptTokens: prompt_eval_count,
    completionTokens: eval_count,
    ollamaReportedMs: total_duration ? Math.round(total_duration / 1e6) : undefined,
  });

  return response.trim();
}

// async function _call(
//   systemPrompt: string,
//   userPrompt: string,
//   temperature: number,
//   maxTokens: number,
//   thinkingMode: boolean,
//   options: OllamaCallOptions = {},
// ): Promise<string> {
//   const finalPrompt = thinkingMode
//     ? `${THINK_TOKEN}\n${userPrompt}`
//     : userPrompt;

//   const t0 = Date.now();

//   const response = await ai.models.generateContent({
//     model: 'gemini-2.5-flash',
//     contents: `
// SYSTEM:
// ${systemPrompt}

// USER:
// ${finalPrompt}
// `,
//     config: {
//       temperature: options.temperature ?? temperature,
//       maxOutputTokens: options.maxTokens ?? maxTokens,
//     },
//   });

//   const latencyMs = Date.now() - t0;

//   logger.debug('[gemini] call complete', {
//     model: 'gemini-2.5-flash',
//     thinkingMode,
//     latencyMs,
//   });

//   return (response.text ?? '').trim();
// }

// ─── JSON helper with one-shot retry ──────────────────────────────────────────

async function _callJson(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  thinkingMode: boolean,
  options: OllamaCallOptions,
): Promise<unknown> {
  const raw = await _call(systemPrompt, userPrompt, temperature, maxTokens, thinkingMode, options);

  // Strip markdown fences if model wraps output
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(clean);
  } catch {
    logger.warn('[ollama] JSON parse failed — retrying with explicit reminder');

    const retryPrompt = `${userPrompt}\n\nIMPORTANT: Return valid JSON only. No markdown, no explanation.`;
    const retryRaw = await _call(systemPrompt, retryPrompt, temperature, maxTokens, thinkingMode, options);
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
 * Fast call — thinking OFF, temp ~0.2, short output.
 * Use for classification, tagging, simple extraction.
 */
export async function fastCall(
  systemPrompt: string,
  userPrompt: string,
  options: OllamaCallOptions = {},
): Promise<string | unknown> {
  if (options.jsonMode) {
    return _callJson(
      systemPrompt,
      userPrompt,
      FAST_DEFAULTS.temperature,
      FAST_DEFAULTS.maxTokens,
      false,
      options,
    );
  }
  return _call(systemPrompt, userPrompt, FAST_DEFAULTS.temperature, FAST_DEFAULTS.maxTokens, false, options);
}

/**
 * Deep call — thinking ON (<|think|>), temp ~0.1, longer output.
 * Use for legal reasoning, FIR drafting, multi-step analysis.
 */
export async function deepCall(
  systemPrompt: string,
  userPrompt: string,
  options: OllamaCallOptions = {},
): Promise<string | unknown> {
  if (options.jsonMode) {
    return _callJson(
      systemPrompt,
      userPrompt,
      DEEP_DEFAULTS.temperature,
      DEEP_DEFAULTS.maxTokens,
      true,
      options,
    );
  }
  return _call(systemPrompt, userPrompt, DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens, true, options);
}
