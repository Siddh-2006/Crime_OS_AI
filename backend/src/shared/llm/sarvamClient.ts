/**
 * sarvamClient.ts
 *
 * LLM client for Sarvam-1 served locally via llama-server (llama.cpp).
 * llama-server exposes an OpenAI-compatible REST API:
 *   POST /v1/chat/completions
 *
 * Usage:
 *   llama-server -m sarvam-1.Q8_0.gguf -c 2048 --port 8004
 *
 * Exports the same fastCall / deepCall / LlmCallOptions interface as the
 * old Ollama client so all call sites work without modification.
 *
 * Key differences from the Ollama client:
 *  - Uses OpenAI chat/completions format (messages array, not prompt string)
 *  - No thinking token (<|think|>) — Sarvam-1 does not support it
 *  - deepCall uses lower temperature + more tokens as the "heavy reasoning" lane
 *  - Context window is 2048 by default (match the -c flag you pass to llama-server)
 */

import axios from 'axios';
import env from '../../config/env';
import logger from '../../config/logger';

// ─── Public options type (kept identical to old OllamaCallOptions) ────────────

export interface LlmCallOptions {
  /** Return parsed JSON object instead of raw string */
  jsonMode?: boolean;
  /** Override max new tokens for this call */
  maxTokens?: number;
  /** Override temperature */
  temperature?: number;
}

// ─── Internal OpenAI chat/completions shapes ─────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: false;
}

interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ─── Call defaults ────────────────────────────────────────────────────────────

const FAST_DEFAULTS = { temperature: 0.3, maxTokens: 512  };
const DEEP_DEFAULTS = { temperature: 0.1, maxTokens: 1024 };

// ─── Core HTTP call ───────────────────────────────────────────────────────────

async function _call(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  lane: 'fast' | 'deep',
  options: LlmCallOptions = {},
): Promise<string> {
  const baseUrl = env.SARVAM_BASE_URL;
  const model   = env.SARVAM_MODEL;
  const timeout = env.SARVAM_TIMEOUT_MS;

  // Warn if we might be approaching the context limit.
  // 1 token ≈ 4 chars is a rough heuristic.
  const estimatedInputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  if (estimatedInputTokens + maxTokens > env.SARVAM_MAX_CTX * 0.9) {
    logger.warn('[sarvam] Input may be close to or exceed context limit', {
      estimatedInputTokens,
      maxTokens,
      contextLimit: env.SARVAM_MAX_CTX,
      hint: 'Consider increasing -c in llama-server or reducing prompt size',
    });
  }

  const body: ChatCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: options.temperature ?? temperature,
    max_tokens:  options.maxTokens  ?? maxTokens,
    stream: false,
  };

  const t0 = Date.now();

  logger.debug('[sarvam] Sending request', {
    lane,
    model,
    temperature: body.temperature,
    max_tokens:  body.max_tokens,
    estimatedInputTokens,
  });

  const res = await axios.post<ChatCompletionResponse>(
    `${baseUrl}/v1/chat/completions`,
    body,
    { timeout },
  );

  const latencyMs = Date.now() - t0;
  const choice    = res.data.choices?.[0];
  const content   = choice?.message?.content ?? '';
  const usage     = res.data.usage;

  logger.info('[sarvam] Call complete', {
    lane,
    model,
    latencyMs,
    promptTokens:     usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    totalTokens:      usage?.total_tokens,
    finishReason:     choice?.finish_reason,
  });

  if (choice?.finish_reason === 'length') {
    logger.warn('[sarvam] Response was truncated (finish_reason=length). ' +
      'Increase -c or reduce prompt size to avoid incomplete output.', { lane });
  }

  return content.trim();
}

// ─── JSON helper with one-shot retry ─────────────────────────────────────────

async function _callJson(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  lane: 'fast' | 'deep',
  options: LlmCallOptions,
): Promise<unknown> {
  const raw = await _call(systemPrompt, userPrompt, temperature, maxTokens, lane, options);

  // Strip markdown fences that the model sometimes wraps around JSON
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(clean);
  } catch {
    logger.warn('[sarvam] JSON parse failed on first attempt — retrying with explicit reminder', { lane });

    const retryUserPrompt = `${userPrompt}\n\nCRITICAL: Return ONLY valid JSON. No markdown fences, no explanation, no extra text.`;
    const retryRaw   = await _call(systemPrompt, retryUserPrompt, temperature, maxTokens, lane, options);
    const retryClean = retryRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

    try {
      return JSON.parse(retryClean);
    } catch (err) {
      logger.error('[sarvam] JSON parse failed after retry', { lane, raw: retryClean });
      throw new Error(`[sarvam] Model did not return valid JSON after retry: ${(err as Error).message}`);
    }
  }
}

// ─── Public API (drop-in replacements for fastCall / deepCall) ───────────────

/**
 * Fast lane — higher temperature, shorter output.
 * Use for: drafting letters, formatting, summarisation, simple classification.
 */
export async function fastCall(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions = {},
): Promise<string | unknown> {
  if (options.jsonMode) {
    return _callJson(
      systemPrompt, userPrompt,
      FAST_DEFAULTS.temperature,
      FAST_DEFAULTS.maxTokens,
      'fast', options,
    );
  }
  return _call(systemPrompt, userPrompt, FAST_DEFAULTS.temperature, FAST_DEFAULTS.maxTokens, 'fast', options);
}

/**
 * Deep lane — lower temperature, longer output.
 * Use for: investigation analysis, ranked steps, suspect candidates, legal reasoning.
 *
 * Note: Sarvam-1 does not support a thinking/reasoning token like Gemma.
 * The "deep" behaviour here is achieved purely through temperature=0.1 and
 * a longer max_tokens budget.
 */
export async function deepCall(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions = {},
): Promise<string | unknown> {
  if (options.jsonMode) {
    return _callJson(
      systemPrompt, userPrompt,
      DEEP_DEFAULTS.temperature,
      DEEP_DEFAULTS.maxTokens,
      'deep', options,
    );
  }
  return _call(systemPrompt, userPrompt, DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens, 'deep', options);
}
