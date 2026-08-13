'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
  isSupportedLanguage,
} from '@/lib/i18n/languages';
import { i18nTranslate } from '@/lib/i18n/i18n';
import { API_ROUTES } from '@/lib/constants';

interface TranslateBatchResponse {
  translations: Array<{
    sourceText: string;
    translatedText: string;
    targetLanguage: SupportedLanguage;
    fromCache: boolean;
  }>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
}

interface TranslationContextValue {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
  t: (text: string) => string;
  translateText: (text: string, targetLanguage?: SupportedLanguage) => Promise<string>;
  translateBatch: (texts: string[], targetLanguage?: SupportedLanguage) => Promise<Record<string, string>>;
  normalizeEditableText: (text: string, sourceLanguage?: SupportedLanguage) => Promise<string>;
  translateCurrentPage: () => Promise<void>;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

interface OriginalTextState {
  original: string;
  lastApplied: string;
}

const textNodeOriginals = new WeakMap<Text, OriginalTextState>();
const attrOriginals = new WeakMap<Element, Map<string, OriginalTextState>>();
const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'CODE', 'PRE']);
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'] as const;

function shouldSkipElement(element: Element | null): boolean {
  if (!element) return true;
  if (SKIPPED_TAGS.has(element.tagName)) return true;
  if (element.closest('[data-no-translate], [translate="no"]')) return true;
  if ((element as HTMLElement).isContentEditable) return true;
  return false;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function requestTranslationBatch(payload: {
  texts: string[];
  sourceLanguage: SupportedLanguage;
  targetLanguage: SupportedLanguage;
}): Promise<TranslateBatchResponse | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
  console.info('[translation] requestTranslationBatch start', {
    sourceLanguage: payload.sourceLanguage,
    targetLanguage: payload.targetLanguage,
    textCount: payload.texts.length,
    sampleTexts: payload.texts.slice(0, 5),
  });

  const token = window.localStorage.getItem('accessToken');
  const response = await fetch(`${baseUrl}${API_ROUTES.TRANSLATION.BATCH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.warn('[translation] requestTranslationBatch failed', {
      status: response.status,
      statusText: response.statusText,
    });
    return null;
  }

  const result = await response.json() as ApiResponse<TranslateBatchResponse>;
  if (!result.success) {
    console.warn('[translation] requestTranslationBatch returned unsuccessful response', {
      result,
    });
    return null;
  }

  console.info('[translation] requestTranslationBatch success', {
    returnedCount: result.data?.translations.length ?? 0,
  });
  return result.data ?? null;
}

function collectTextNodes(root: ParentNode): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = normalizeWhitespace(node.nodeValue ?? '');
      if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
      if (shouldSkipElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function collectAttrTargets(root: ParentNode): Array<{ element: Element; attr: string; value: string }> {
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from(root.querySelectorAll('*'));
  const targets: Array<{ element: Element; attr: string; value: string }> = [];

  elements.forEach((element) => {
    if (shouldSkipElement(element)) return;
    TRANSLATABLE_ATTRS.forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value && normalizeWhitespace(value).length > 1) {
        targets.push({ element, attr, value });
      }
    });
  });

  return targets;
}

export function TranslationProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const [activeMessage, setActiveMessage] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const isApplyingRef = useRef(false);
  const languageRef = useRef<SupportedLanguage>(DEFAULT_LANGUAGE);
  const lastRouteTranslationRef = useRef<string | null>(null);
  const didMountLanguageRef = useRef(false);
  const isLanguageChangingRef = useRef(false);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const pendingTranslationTimeoutRef = useRef<number | null>(null);
  const activeMessageTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      setLanguageState(stored);
      languageRef.current = stored;
      document.documentElement.lang = stored;
    }
    setIsPreferenceLoaded(true);
  }, []);

  const t = useCallback(
    (text: string): string => i18nTranslate(text, language) ?? text,
    [language],
  );

  const translateBatch = useCallback(
    async (
      texts: string[],
      targetLanguage = languageRef.current,
    ): Promise<Record<string, string>> => {
      const uniqueTexts = Array.from(new Set(texts.map(normalizeWhitespace).filter(Boolean)));
      const output: Record<string, string> = {};

      uniqueTexts.forEach((text) => {
        if (targetLanguage === 'en') {
          output[text] = text;
          return;
        }

        const staticTranslation = i18nTranslate(text, targetLanguage);
        if (staticTranslation) {
          output[text] = staticTranslation;
          return;
        }

        const cacheKey = `${targetLanguage}:${text}`;
        const cached = cacheRef.current.get(cacheKey);
        if (cached) output[text] = cached;
      });

      const missingTexts = uniqueTexts.filter((text) => output[text] === undefined);
      if (missingTexts.length === 0) return output;

      try {
        const data = await requestTranslationBatch({
          sourceLanguage: 'en',
          targetLanguage,
          texts: missingTexts,
        });

        if (data) {
          data.translations.forEach((item) => {
            output[item.sourceText] = item.translatedText;
            cacheRef.current.set(`${targetLanguage}:${item.sourceText}`, item.translatedText);
          });
        }
      } catch {
        // Fall through to the English fallback below.
      }

      missingTexts.forEach((text) => {
        if (output[text] === undefined) output[text] = text;
      });

      return output;
    },
    [],
  );

  const translateText = useCallback(
    async (
      text: string,
      targetLanguage = languageRef.current,
    ): Promise<string> => {
      const normalized = normalizeWhitespace(text);
      if (!normalized) return text;
      const translations = await translateBatch([normalized], targetLanguage);
      return translations[normalized] ?? text;
    },
    [translateBatch],
  );

  const normalizeEditableText = useCallback(
    async (
      text: string,
      sourceLanguage = languageRef.current,
    ): Promise<string> => {
      if (sourceLanguage === 'en') return text;
      const normalized = normalizeWhitespace(text);
      if (!normalized) return text;

      try {
        const data = await requestTranslationBatch({
          sourceLanguage,
          targetLanguage: 'en',
          texts: [text],
        });
        return data?.translations[0]?.translatedText ?? text;
      } catch {
        return text;
      }
    },
    [],
  );

  const applyTranslations = useCallback(async (targetLanguage: SupportedLanguage) => {
    if (typeof document === 'undefined' || isApplyingRef.current) return;
    isApplyingRef.current = true;

    // Pause the mutation observer while we apply translations to avoid
    // triggering infinite re-translation loops and disrupting React's DOM.
    const currentObserver = mutationObserverRef.current;
    if (currentObserver) {
      currentObserver.disconnect();
    }

    try {
      const nodes = collectTextNodes(document.body);
      const attrs = collectAttrTargets(document.body);

      const sourceTexts: string[] = [];
      nodes.forEach((node) => {
        const current = node.nodeValue ?? '';
        const stored = textNodeOriginals.get(node);
        if (!stored || current !== stored.lastApplied) {
          textNodeOriginals.set(node, { original: current, lastApplied: current });
        }
        const original = normalizeWhitespace(textNodeOriginals.get(node)?.original ?? '');
        if (original) sourceTexts.push(original);
      });

      attrs.forEach(({ element, attr, value }) => {
        let originals = attrOriginals.get(element);
        if (!originals) {
          originals = new Map();
          attrOriginals.set(element, originals);
        }
        const stored = originals.get(attr);
        if (!stored || value !== stored.lastApplied) {
          originals.set(attr, { original: value, lastApplied: value });
        }
        const original = normalizeWhitespace(originals.get(attr)?.original ?? '');
        if (original) sourceTexts.push(original);
      });

      console.info('[translation] applyTranslations start', {
        targetLanguage,
        totalTexts: sourceTexts.length,
        uniqueTexts: Array.from(new Set(sourceTexts)).length,
      });

      if (sourceTexts.length === 0) {
        console.debug('[translation] no visible texts found to translate');
      }

      if (pendingTranslationTimeoutRef.current) {
        window.clearTimeout(pendingTranslationTimeoutRef.current);
        pendingTranslationTimeoutRef.current = null;
      }

      setActiveMessage('Translating... please wait until the result is returned.');
      const translations = await translateBatch(sourceTexts, targetLanguage);

      // Only mutate nodes that actually need updating to minimise React disruption
      nodes.forEach((node) => {
        const stored = textNodeOriginals.get(node);
        const original = stored?.original ?? node.nodeValue ?? '';
        const key = normalizeWhitespace(original);
        const nextValue = targetLanguage === 'en' ? original : translations[key] ?? original;
        if (nextValue !== node.nodeValue) {
          console.debug('[translation] node text updated', { original, nextValue });
          node.nodeValue = nextValue;
        }
        textNodeOriginals.set(node, { original, lastApplied: nextValue });
      });

      attrs.forEach(({ element, attr }) => {
        const stored = attrOriginals.get(element)?.get(attr);
        const original = stored?.original;
        if (!original) return;
        const key = normalizeWhitespace(original);
        const nextValue = targetLanguage === 'en' ? original : translations[key] ?? original;
        if (nextValue !== element.getAttribute(attr)) {
          console.debug('[translation] attr text updated', { attr, original, nextValue });
          element.setAttribute(attr, nextValue);
        }
        attrOriginals.get(element)?.set(attr, { original, lastApplied: nextValue });
      });
    } finally {
      isApplyingRef.current = false;
      if (activeMessageTimeoutRef.current) {
        window.clearTimeout(activeMessageTimeoutRef.current);
      }
      activeMessageTimeoutRef.current = window.setTimeout(() => {
        setActiveMessage(null);
      }, 2400);

      // Reconnect the observer AFTER we finish mutating the DOM
      if (currentObserver && typeof document !== 'undefined') {
        currentObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }
  }, [translateBatch]);

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    if (activeMessageTimeoutRef.current) {
      window.clearTimeout(activeMessageTimeoutRef.current);
      activeMessageTimeoutRef.current = null;
    }
    setActiveMessage('Translating... please wait until the result is returned.');

    setLanguageState(nextLanguage);
    languageRef.current = nextLanguage;
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    isLanguageChangingRef.current = true;
    void applyTranslations(nextLanguage);
  }, [applyTranslations]);

  const translateCurrentPage = useCallback(
    async (): Promise<void> => applyTranslations(languageRef.current),
    [applyTranslations],
  );

  useEffect(() => {
    if (!isPreferenceLoaded) return;
    if (lastRouteTranslationRef.current === pathname) return;
    lastRouteTranslationRef.current = pathname;

    // Only translate if a non-English language is active
    if (languageRef.current === 'en') return;

    // Single deferred call - wait for React to finish rendering the new page
    const timer = window.setTimeout(() => {
      void applyTranslations(languageRef.current);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [applyTranslations, isPreferenceLoaded, pathname]);

  useEffect(() => {
    if (!isPreferenceLoaded) return;
    if (!didMountLanguageRef.current) {
      didMountLanguageRef.current = true;
      return;
    }

    if (isLanguageChangingRef.current) {
      isLanguageChangingRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void applyTranslations(language);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [applyTranslations, isPreferenceLoaded, language]);

  useEffect(() => {
    if (typeof document === 'undefined' || mutationObserverRef.current) return;

    const observer = new MutationObserver((mutations) => {
      if (isApplyingRef.current) return;
      // Only re-translate if the language is non-English and content was actually added
      if (languageRef.current === 'en') return;

      const hasNewContent = mutations.some((mutation) => {
        if (mutation.type === 'characterData' && mutation.target.nodeValue) {
          // Ignore mutations caused by our own translation writes
          const node = mutation.target as Text;
          const stored = textNodeOriginals.get(node);
          if (stored && node.nodeValue === stored.lastApplied) return false;
          return true;
        }
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Only trigger if actual element or non-empty text nodes were added
          return Array.from(mutation.addedNodes).some(
            (n) => n.nodeType === Node.ELEMENT_NODE || (n.nodeType === Node.TEXT_NODE && (n.nodeValue?.trim().length ?? 0) > 1)
          );
        }
        return false;
      });

      if (!hasNewContent) return;
      if (pendingTranslationTimeoutRef.current) {
        window.clearTimeout(pendingTranslationTimeoutRef.current);
      }

      // Use a longer debounce (600ms) so React finishes rendering before we walk the DOM
      pendingTranslationTimeoutRef.current = window.setTimeout(() => {
        console.debug('[translation] DOM mutation detected, reapplying translations');
        void applyTranslations(languageRef.current);
      }, 600);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    mutationObserverRef.current = observer;
    return () => {
      observer.disconnect();
      mutationObserverRef.current = null;
      if (pendingTranslationTimeoutRef.current) {
        window.clearTimeout(pendingTranslationTimeoutRef.current);
      }
    };
  }, [applyTranslations]);

  const value = useMemo<TranslationContextValue>(
    () => ({
      language,
      setLanguage,
      supportedLanguages: SUPPORTED_LANGUAGES,
      t,
      translateText,
      translateBatch,
      normalizeEditableText,
      translateCurrentPage,
    }),
    [language, normalizeEditableText, setLanguage, t, translateBatch, translateCurrentPage, translateText],
  );

  return (
    <>
      <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>
      {activeMessage && (
        <div className="fixed top-4 left-1/2 z-50 w-full max-w-3xl -translate-x-1/2 rounded-2xl border border-slate-300 bg-slate-950/95 px-5 py-3 text-sm font-semibold text-white shadow-2xl shadow-slate-900/30 backdrop-blur-sm">
          {activeMessage}
        </div>
      )}
    </>
  );
}

export function useTranslation(): TranslationContextValue {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used inside TranslationProvider');
  }
  return context;
}
