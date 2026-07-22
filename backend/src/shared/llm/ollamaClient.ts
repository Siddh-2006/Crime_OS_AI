/**
 * ollamaClient.ts — DISABLED
 *
 * Ollama + Gemma4:e2b was replaced by Sarvam-1 via llama-server.
 * All call sites still import { fastCall, deepCall } from './ollamaClient'
 * and continue to work — this file now re-exports from sarvamClient.ts.
 *
 * The original Ollama implementation is preserved below (commented out)
 * so it can be restored if needed.
 */

// ─── Active: delegate to Sarvam client ───────────────────────────────────────

export type { LlmCallOptions as OllamaCallOptions } from './sarvamClient';
export { fastCall, deepCall } from './sarvamClient';

// ─── OLD Ollama implementation — COMMENTED OUT ────────────────────────────────
//
// import axios from 'axios';
// import env from '../../config/env';
// import logger from '../../config/logger';
//
// export interface OllamaCallOptions {
//   jsonMode?: boolean;
//   maxTokens?: number;
//   temperature?: number;
// }
//
// interface OllamaGenerateRequest {
//   model: string;
//   prompt: string;
//   system?: string;
//   stream: false;
//   options: {
//     temperature: number;
//     num_predict: number;
//     num_ctx: number;
//   };
// }
//
// interface OllamaGenerateResponse {
//   response: string;
//   prompt_eval_count?: number;
//   eval_count?: number;
//   total_duration?: number;
// }
//
// const FAST_MODEL = 'gemma4:e2b';
// const FAST_DEFAULTS = { temperature: 0.2, maxTokens: 512 };
// const DEEP_DEFAULTS = { temperature: 0.1, maxTokens: 2048 };
// const THINK_TOKEN = '<|think|>';
//
// async function _call(
//   systemPrompt: string,
//   userPrompt: string,
//   temperature: number,
//   maxTokens: number,
//   thinkingMode: boolean,
//   options: OllamaCallOptions = {},
// ): Promise<string> {
//   const finalPrompt = thinkingMode ? `${THINK_TOKEN}\n${userPrompt}` : userPrompt;
//   const body: OllamaGenerateRequest = {
//     model: FAST_MODEL,
//     prompt: finalPrompt,
//     system: systemPrompt,
//     stream: false,
//     options: {
//       temperature: options.temperature ?? temperature,
//       num_predict: options.maxTokens ?? maxTokens,
//       num_ctx: env.OLLAMA_NUM_CTX,
//     },
//   };
//   const t0 = Date.now();
//   const res = await axios.post<OllamaGenerateResponse>(
//     `${env.OLLAMA_BASE_URL}/api/generate`,
//     body,
//     { timeout: 120_000 },
//   );
//   const latencyMs = Date.now() - t0;
//   const { response, prompt_eval_count, eval_count, total_duration } = res.data;
//   logger.debug('[ollama] call complete', {
//     model: FAST_MODEL,
//     thinkingMode,
//     latencyMs,
//     promptTokens: prompt_eval_count,
//     completionTokens: eval_count,
//     ollamaReportedMs: total_duration ? Math.round(total_duration / 1e6) : undefined,
//   });
//   return response.trim();
// }
//
// async function _callJson(
//   systemPrompt: string,
//   userPrompt: string,
//   temperature: number,
//   maxTokens: number,
//   thinkingMode: boolean,
//   options: OllamaCallOptions,
// ): Promise<unknown> {
//   const raw = await _call(systemPrompt, userPrompt, temperature, maxTokens, thinkingMode, options);
//   const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
//   try {
//     return JSON.parse(clean);
//   } catch {
//     logger.warn('[ollama] JSON parse failed — retrying with explicit reminder');
//     const retryPrompt = `${userPrompt}\n\nIMPORTANT: Return valid JSON only. No markdown, no explanation.`;
//     const retryRaw = await _call(systemPrompt, retryPrompt, temperature, maxTokens, thinkingMode, options);
//     const retryClean = retryRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
//     try {
//       return JSON.parse(retryClean);
//     } catch (err) {
//       logger.error('[ollama] JSON parse failed after retry', { raw: retryClean });
//       throw new Error(`Ollama did not return valid JSON: ${(err as Error).message}`);
//     }
//   }
// }
//
// export async function fastCall(
//   systemPrompt: string,
//   userPrompt: string,
//   options: OllamaCallOptions = {},
// ): Promise<string | unknown> {
//   if (options.jsonMode) {
//     return _callJson(systemPrompt, userPrompt, FAST_DEFAULTS.temperature, FAST_DEFAULTS.maxTokens, false, options);
//   }
//   return _call(systemPrompt, userPrompt, FAST_DEFAULTS.temperature, FAST_DEFAULTS.maxTokens, false, options);
// }
//
// export async function deepCall(
//   systemPrompt: string,
//   userPrompt: string,
//   options: OllamaCallOptions = {},
// ): Promise<string | unknown> {
//   if (options.jsonMode) {
//     return _callJson(systemPrompt, userPrompt, DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens, true, options);
//   }
//   return _call(systemPrompt, userPrompt, DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens, true, options);
// }
