'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from '@/context/TranslationContext';
import type { SupportedLanguage } from '@/lib/i18n/languages';

export function LanguageSelector(): React.ReactElement {
  const { language, setLanguage, supportedLanguages } = useTranslation();

  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-neutral-900/50/10 px-2 py-1 text-xs font-semibold text-current">
      <Languages size={14} aria-hidden="true" />
      <span className="sr-only">Language</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
        className="bg-transparent text-current outline-none"
        data-no-translate
        aria-label="Language"
      >
        {supportedLanguages.map((item) => (
          <option key={item.code} value={item.code} className="text-white">
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
