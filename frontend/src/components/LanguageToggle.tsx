'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Languages, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from '@/context/TranslationContext';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '@/lib/i18n/languages';

export function LanguageToggle() {
  const { language, setLanguage } = useTranslation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeLang = SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-text-primary bg-surface-elevated hover:bg-surface-elevated/80 border border-border rounded-xl transition-all shadow-xs cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary"
        title="Change Website Language"
        type="button"
      >
        <Languages size={14} className="text-brand-primary" />
        <span>{activeLang.name}</span>
        <ChevronDown size={12} className={`text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl bg-surface border border-border shadow-2xl z-50 p-1.5 space-y-0.5 animate-in fade-in slide-in-from-top-2 duration-150">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.code === language;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setLanguage(lang.code as SupportedLanguage);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                    : 'text-text-primary hover:bg-surface-elevated'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase font-bold text-text-secondary bg-surface-elevated px-1.5 py-0.5 rounded border border-border">
                    {lang.label}
                  </span>
                  <span>{lang.name}</span>
                </div>
                {isSelected && <Check size={13} className="text-brand-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
