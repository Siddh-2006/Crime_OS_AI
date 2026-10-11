import logger from '../../config/logger';
import env from '../../config/env';
import { BatchTranslateInput, TranslationItem } from './types';

const translationCache = new Map<string, string>();

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cacheKey(sourceLanguage: string, targetLanguage: string, text: string): string {
  return `${sourceLanguage}:${targetLanguage}:${text}`;
}

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
    try {
      const targetLangMap: Record<string, string> = {
        'English': 'English', 'Hindi': 'Hindi', 'Gujarati': 'Gujarati', 'en': 'English', 'hi': 'Hindi', 'gu': 'Gujarati'
      };
      const targetLang = targetLangMap[input.targetLanguage] || 'English';

      if (!env.GEMINI_API_KEY) {
        logger.warn('[translation] GEMINI_API_KEY is missing, returning original texts');
        return texts;
      }

      const keys = env.GEMINI_API_KEY.split(',');
      const apiKey = keys[Math.floor(Math.random() * keys.length)].trim();

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `Translate the following JSON array of strings from English to ${targetLang}. 
You are translating a police investigation application UI and case data.
Maintain the EXACT array length and string order. 
Do not add any markdown formatting, only return the valid JSON array of translated strings.
Preserve the exact meaning, tone, and any punctuation or spacing if possible.

Strings to translate:
${JSON.stringify(texts)}`;

      let success = false;
      let attempt = 0;
      const maxRetries = 2;
      
      while (!success && attempt < maxRetries) {
        try {
          const response = await ai.models.generateContent({
              model: env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
              contents: prompt,
              config: {
                 responseMimeType: 'application/json',
              }
          });

          if (!response.text) {
             throw new Error("Empty response from Gemini");
          }

          let responseText = response.text;
          
          if (responseText.startsWith('```json')) {
              responseText = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
          } else if (responseText.startsWith('```')) {
              responseText = responseText.replace(/^```/, '').replace(/```$/, '').trim();
          }
          
          const translatedArray = JSON.parse(responseText);
          
          if (!Array.isArray(translatedArray)) {
             throw new Error("Response is not a JSON array");
          }
          if (translatedArray.length !== texts.length) {
             throw new Error(`Length mismatch: got ${translatedArray.length}, expected ${texts.length}`);
          }
          
          return translatedArray;
        } catch (e) {
          logger.warn('[translation] Gemini API attempt failed', { error: String(e) });
          attempt++;
          if (attempt >= maxRetries) {
             return texts;
          }
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }

      return texts;
    } catch (error) {
      logger.error('[translation] Translation engine failed entirely', {
        error: error instanceof Error ? error.message : String(error),
      });
      return texts; // fallback to original
    }
  }
}

export const translationService = new TranslationService();
