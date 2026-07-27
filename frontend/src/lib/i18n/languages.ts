export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'Eng', name: 'English' },
  { code: 'hi', label: 'Hin', name: 'Hindi' },
  { code: 'gu', label: 'Guj', name: 'Gujarati' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const LANGUAGE_STORAGE_KEY = 'crime-os-language';

export function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value === 'en' || value === 'hi' || value === 'gu';
}
