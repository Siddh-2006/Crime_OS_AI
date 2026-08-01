import env from '../../config/env';
import logger from '../../config/logger';
import { fastCall } from '../../shared/llm/ollamaClient';
import { geminifast } from '../../shared/llm/geminiClient';
import { BatchTranslateInput, TranslationItem } from './types';

const translationCache = new Map<string, string>();

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cacheKey(sourceLanguage: string, targetLanguage: string, text: string): string {
  return `${sourceLanguage}:${targetLanguage}:${text}`;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  gu: 'Gujarati',
};

export class TranslationService {
  async translateBatch(input: BatchTranslateInput): Promise<TranslationItem[]> {
    const texts = input.texts.map(normalizeText).filter(Boolean);

    if (input.sourceLanguage === input.targetLanguage) {
      return texts.map((text) => ({
        sourceText: text,
        translatedText: text,
        targetLanguage: input.targetLanguage,
        fromCache: true,
      }));
    }

    const output = new Map<string, TranslationItem>();
    const missingTexts: string[] = [];

    texts.forEach((text) => {
      const key = cacheKey(input.sourceLanguage, input.targetLanguage, text);
      const cached = translationCache.get(key);
      if (cached) {
        output.set(text, {
          sourceText: text,
          translatedText: cached,
          targetLanguage: input.targetLanguage,
          fromCache: true,
        });
      } else {
        missingTexts.push(text);
      }
    });

    if (missingTexts.length > 0) {
      logger.info('[translation] cache miss for texts', {
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        missingCount: missingTexts.length,
        sampleMissing: missingTexts.slice(0, 5),
      });

      const translated = await this.translateMissingTexts(input, missingTexts);
      translated.forEach((translatedText, index) => {
        const sourceText = missingTexts[index];
        const fallbackText = translatedText || sourceText;
        translationCache.set(
          cacheKey(input.sourceLanguage, input.targetLanguage, sourceText),
          fallbackText,
        );
        output.set(sourceText, {
          sourceText,
          translatedText: fallbackText,
          targetLanguage: input.targetLanguage,
          fromCache: false,
        });
      });
    }

    return texts.map((text) => output.get(text) ?? {
      sourceText: text,
      translatedText: text,
      targetLanguage: input.targetLanguage,
      fromCache: false,
    });
  }

  private async translateMissingTexts(
    input: BatchTranslateInput,
    texts: string[],
  ): Promise<string[]> {
    // 1. Try local Ollama first
    try {
      const sourceLanguage = LANGUAGE_NAMES[input.sourceLanguage] ?? input.sourceLanguage;
      const targetLanguage = LANGUAGE_NAMES[input.targetLanguage] ?? input.targetLanguage;
      
      const result = await fastCall(
        'You are a precise translation engine. Preserve meaning, punctuation, numbers, names, URLs, IDs, and line breaks. Return only valid JSON.',
        JSON.stringify({
          task: 'Translate each item and return a JSON array of strings in the same order.',
          sourceLanguage,
          targetLanguage,
          texts,
        }),
        { jsonMode: true, temperature: 0.1, maxTokens: 4096 },
      );

      if (Array.isArray(result) && result.length === texts.length) {
        return texts.map((text, index) => {
          const translatedText = result[index];
          return typeof translatedText === 'string' && translatedText.trim()
            ? translatedText
            : text;
        });
      }
      
      logger.warn('[translation] Ollama returned invalid structure. Falling back to Gemini.');
      return this.translateWithGemini(input, texts);
    } catch (error) {
      logger.warn('[translation] Ollama failed. Falling back to Gemini.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.translateWithGemini(input, texts);
    }
  }

  private async translateWithGemini(
    input: BatchTranslateInput,
    texts: string[],
  ): Promise<string[]> {
    if (!env.GEMINI_API_KEY) {
      logger.warn('[translation] GEMINI_API_KEY not set. Returning source text.');
      return texts;
    }

    try {
      const sourceLanguage = LANGUAGE_NAMES[input.sourceLanguage] ?? input.sourceLanguage;
      const targetLanguage = LANGUAGE_NAMES[input.targetLanguage] ?? input.targetLanguage;
      
      const result = await geminifast(
        'You are a precise translation engine. Preserve meaning, punctuation, numbers, names, URLs, IDs, and line breaks. Return only valid JSON.',
        JSON.stringify({
          task: 'Translate each item and return a JSON array of strings in the same order.',
          sourceLanguage,
          targetLanguage,
          texts,
        }),
        { jsonMode: true, temperature: 0.1, maxTokens: 4096 },
      );

      if (!Array.isArray(result)) {
        return texts;
      }

      return texts.map((text, index) => {
        const translatedText = result[index];
        return typeof translatedText === 'string' && translatedText.trim()
          ? translatedText
          : text;
      });
    } catch (error) {
      logger.warn('[translation] Gemini fallback failed; returning source text', {
        error: error instanceof Error ? error.message : String(error),
      });
      return texts;
    }
  }
}

export const translationService = new TranslationService();
