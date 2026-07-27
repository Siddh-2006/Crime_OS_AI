export type SupportedLanguage = 'en' | 'hi' | 'gu';

export interface TranslationItem {
  sourceText: string;
  translatedText: string;
  targetLanguage: SupportedLanguage;
  fromCache: boolean;
}

export interface BatchTranslateInput {
  texts: string[];
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
}

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'en' || value === 'hi' || value === 'gu';
}
