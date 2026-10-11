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
  /** Explicit timeout override */
  timeoutMs?: number;
}

// ─── Ollama API shapes ────────────────────────────────────────────────────────

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

const FAST_MODEL = env.OLLAMA_REQUIRED_MODELS.split(',')[0].trim(); // reads from env — stays in sync
const FAST_DEFAULTS = { temperature: 0.2, maxTokens: 512 };
const DEEP_DEFAULTS = { temperature: 0.1, maxTokens: 8192 };

// Gemma 4 chat-template control token that activates extended thinking
const THINK_TOKEN = '<|think|>';

// ─── Core Ollama request ──────────────────────────────────────────────────────

async function _ollamaCall(
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
  const timeoutMs = options.timeoutMs ?? (body.options.num_predict <= 1024 ? 15000 : 60000);

  logger.debug('[ollama] Sending request', {
    model: FAST_MODEL,
    thinkingMode,
    temperature: body.options.temperature,
    num_predict: body.options.num_predict,
    timeoutMs,
  });

  const res = await axios.post<OllamaGenerateResponse>(
    `${env.OLLAMA_BASE_URL}/api/generate`,
    body,
    { timeout: timeoutMs },
  );

  const latencyMs = Date.now() - t0;
  const { response, prompt_eval_count, eval_count, total_duration } = res.data;

  logger.info('[ollama] Call complete', {
    model: FAST_MODEL,
    thinkingMode,
    latencyMs,
    promptTokens: prompt_eval_count,
    completionTokens: eval_count,
    ollamaReportedMs: total_duration ? Math.round(total_duration / 1e6) : undefined,
  });

  logger.debug('[ollama] call complete', {
    model: FAST_MODEL,
    thinkingMode,
    latencyMs,
  });

  return (response ?? '').trim();
}

// ─── JSON helper (shared by both lanes) ──────────────────────────────────────

async function _ollamaCallJson(
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  maxTokens: number,
  thinkingMode: boolean,
  options: OllamaCallOptions,
): Promise<unknown> {
  const raw = await _ollamaCall(systemPrompt, userPrompt, temperature, maxTokens, thinkingMode, options);
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    return JSON.parse(clean);
  } catch {
    logger.warn('[ollama] JSON parse failed — retrying with explicit reminder');
    const retryRaw = await _ollamaCall(
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
  userPrompt: string,
  options: OllamaCallOptions = {},
): Promise<string | unknown> {
  if (env.LLM_BACKEND === 'gemini') {
    return geminifast(systemPrompt, userPrompt, options);
  }
  
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
 * Deep lane — thinking OFF (GPU-optimised), temp 0.1, 8192 tokens.
 * Primary: Ollama (local GPU).  Fallback: Gemini 2.5 Flash.
 */
export async function deepCall(
  systemPrompt: string,
  userPrompt: string,
  options: OllamaCallOptions = {},
): Promise<string | unknown> {
  if (env.LLM_BACKEND === 'gemini') {
    return geminiDeep(systemPrompt, userPrompt, options);
  }

  try {
    if (options.jsonMode) {
      return await _ollamaCallJson(
        systemPrompt, userPrompt,
        DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens,
        false, options, // No <|think|> token — GPU handles speed natively
      );
    }
    return await _ollamaCall(
      systemPrompt, userPrompt,
      DEEP_DEFAULTS.temperature, DEEP_DEFAULTS.maxTokens,
      false, options, // No <|think|> token — GPU handles speed natively
    );
  } catch (ollamaErr: any) {
    logger.warn('[ollama] deepCall failed — falling back to Gemini 2.5 Flash', {
      error: ollamaErr?.message,
      hint: 'Ensure Ollama is running: ollama serve',
    });
    return geminiDeep(systemPrompt, userPrompt, options);
  }
}

