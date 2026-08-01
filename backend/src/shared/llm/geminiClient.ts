/**
 * geminiClient.ts
 *
 * Cloud fallback LLM client using Google Gemini via @google/genai.
 *
 * Supports multiple API keys provided as a comma-separated list in GEMINI_API_KEY.
 * It will loop through the keys on failure to ensure maximum availability.
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import env from '../../config/env';
import logger from '../../config/logger';
import type { OllamaCallOptions } from './ollamaClient';

let _keys: string[] = [];
let _currentKeyIndex = 0;

function getKeys(): string[] {
  if (_keys.length === 0) {
    if (!env.GEMINI_API_KEY) {
      throw new Error('[gemini] GEMINI_API_KEY is not set. Add it to .env to enable the Gemini cloud fallback.');
    }
    _keys = env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(Boolean);
    if (_keys.length === 0) {
      throw new Error('[gemini] No valid keys found in GEMINI_API_KEY.');
    }
  }
  return _keys;
}

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

async function _geminiCall(
  systemPrompt: string,
  userPrompt:   string,
  lane:         'fast' | 'deep',
  options:      OllamaCallOptions = {},
): Promise<string> {
  const allKeys = getKeys();
  const model = env.GEMINI_MODEL;
  const thinkingBudget = lane === 'deep' ? 8192 : undefined;

  logger.info('[gemini] Sending request', {
    lane,
    model,
    thinking: lane === 'deep' ? 'enabled (budget: 8192)' : 'disabled',
    jsonMode: options.jsonMode ?? false,
    keysAvailable: allKeys.length,
  });

  let lastError: any;

  for (let i = 0; i < allKeys.length; i++) {
    const attemptIndex = (_currentKeyIndex + i) % allKeys.length;
    const apiKey = allKeys[attemptIndex];
    const ai = new GoogleGenAI({ apiKey });

    const t0 = Date.now();
    try {
      logger.debug(`[gemini] Attempting call with key index ${attemptIndex}`);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: systemPrompt,
          temperature: options.temperature ?? 1.0,
          ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
          safetySettings: SAFETY_SETTINGS,
        },
      });

      const latencyMs = Date.now() - t0;
      const text = response.text ?? '';
      const usage = (response as any).usageMetadata;

      logger.info('[gemini] Call complete', {
        lane,
        model,
        keyIndexUsed: attemptIndex,
        latencyMs,
        responseExcerpt: text.substring(0, 150).replace(/\n/g, ' ') + '...', // Log what answer it gave
        totalTokens: usage?.totalTokenCount,
      });

      // Stick to this key for future calls until it fails
      _currentKeyIndex = attemptIndex;

      return text.trim();
    } catch (err: any) {
      logger.warn(`[gemini] Call failed with key at index ${attemptIndex}`, {
        error: err.message || err.toString(),
      });
      lastError = err;
      // Loop continues to try the next key
    }
  }

  logger.error('[gemini] All available keys failed.', { lastError: lastError?.message });
  throw new Error(`[gemini] All ${allKeys.length} keys failed. Last error: ${lastError?.message}`);
}

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
