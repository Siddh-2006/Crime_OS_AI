/**
 * geminiClient.ts
 *
 * Cloud fallback LLM client using Google Gemini via @google/genai.
 * Only invoked when Ollama is unreachable.
 *
 * Model: gemini-2.5-flash-lite (configurable via GEMINI_MODEL env var)
 *
 * Lane mapping:
 *   fastCall → temperature 1.0, no thinking budget (fast, cheap)
 *   deepCall → temperature 1.0, thinking budget 8192 tokens (Gemini's built-in reasoning)
 *
 * Requires GEMINI_API_KEY in env. If the key is empty, all calls throw
 * immediately so the caller can surface a clear error.
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import env from '../../config/env';
import logger from '../../config/logger';
import type { OllamaCallOptions } from './ollamaClient';

// ─── Singleton client ─────────────────────────────────────────────────────────

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_client) {
    if (!env.GEMINI_API_KEY) {
      throw new Error(
        '[gemini] GEMINI_API_KEY is not set. ' +
        'Add it to .env to enable the Gemini cloud fallback.',
      );
    }
    _client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return _client;
}

// ─── Safety settings (permissive for police investigation context) ────────────

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// ─── Core call ────────────────────────────────────────────────────────────────

async function _geminiCall(
  systemPrompt: string,
  userPrompt:   string,
  lane:         'fast' | 'deep',
  options:      OllamaCallOptions = {},
): Promise<string> {
  const ai    = getClient();
  const model = env.GEMINI_MODEL;

  // Deep lane uses Gemini's thinking capability (reasoning tokens)
  // Only enable thinking for the deep lane.
  // Sending thinkingBudget: 0 to flash-lite models causes 400 INVALID_ARGUMENT.
  const thinkingBudget = lane === 'deep' ? 8192 : undefined;

  logger.info('[gemini] Sending request', {
    lane,
    model,
    thinking: lane === 'deep' ? 'enabled (budget: 8192)' : 'disabled',
    jsonMode: options.jsonMode ?? false,
  });

  const t0 = Date.now();

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: options.temperature ?? 1.0,
      ...(thinkingBudget !== undefined
        ? { thinkingConfig: { thinkingBudget } }
        : {}),
      safetySettings: SAFETY_SETTINGS,
    },
  });

  const latencyMs = Date.now() - t0;
  const text      = response.text ?? '';
  const usage     = (response as any).usageMetadata;

  logger.info('[gemini] Call complete', {
    lane,
    model,
    latencyMs,
    promptTokens:     usage?.promptTokenCount,
    completionTokens: usage?.candidatesTokenCount,
    thoughtTokens:    usage?.thoughtsTokenCount,
    totalTokens:      usage?.totalTokenCount,
  });

  return text.trim();
}

// ─── JSON helper ──────────────────────────────────────────────────────────────

async function _geminiCallJson(
  systemPrompt: string,
  userPrompt:   string,
  lane:         'fast' | 'deep',
  options:      OllamaCallOptions,
): Promise<unknown> {
  const raw   = await _geminiCall(systemPrompt, userPrompt, lane, options);
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(clean);
  } catch {
    logger.warn('[gemini] JSON parse failed — retrying with explicit reminder', { lane });
    const retry      = await _geminiCall(
      systemPrompt,
      `${userPrompt}\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanation.`,
      lane,
      options,
    );
    const retryClean = retry.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      return JSON.parse(retryClean);
    } catch (err) {
      logger.error('[gemini] JSON parse failed after retry', { lane, raw: retryClean });
      throw new Error(`[gemini] Model did not return valid JSON after retry: ${(err as Error).message}`);
    }
  }
}

// ─── Public API (same signature as ollamaClient exports) ─────────────────────

export async function geminifast(
  systemPrompt: string,
  userPrompt:   string,
  options:      OllamaCallOptions = {},
): Promise<string | unknown> {
  if (options.jsonMode) return _geminiCallJson(systemPrompt, userPrompt, 'fast', options);
  return _geminiCall(systemPrompt, userPrompt, 'fast', options);
}

export async function geminiDeep(
  systemPrompt: string,
  userPrompt:   string,
  options:      OllamaCallOptions = {},
): Promise<string | unknown> {
  if (options.jsonMode) return _geminiCallJson(systemPrompt, userPrompt, 'deep', options);
  return _geminiCall(systemPrompt, userPrompt, 'deep', options);
}
