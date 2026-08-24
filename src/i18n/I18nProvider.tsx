"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import en from "./messages/en.json";
import zh from "./messages/zh.json";
import ms from "./messages/ms.json";
import ta from "./messages/ta.json";
import {
  DEFAULT_LOCALE,
  STORAGE_KEY,
  detectLocale,
  isLocale,
  type Locale,
} from "./config";

type Messages = Record<string, string>;

const CATALOGUES: Record<Locale, Messages> = { en, zh, ms, ta };

/** Every key that exists in the English catalogue — the source of truth. */
export type MessageKey = keyof typeof en;

export type Translate = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  /** False until the stored/system preference has been read. */
  ready: boolean;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start on the default so server and first client render agree; the real
  // preference is applied in an effect to avoid a hydration mismatch.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let chosen: Locale = DEFAULT_LOCALE;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      chosen = isLocale(stored)
        ? stored
        : detectLocale(navigator.languages ?? [navigator.language]);
    } catch {
      // Blocked storage: fall back to the browser's languages alone.
      chosen = detectLocale(
        typeof navigator !== "undefined"
          ? (navigator.languages ?? [navigator.language])
          : [],
      );
    }
    setLocaleState(chosen);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice still applies for this session.
    }
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      const catalogue = CATALOGUES[locale] as Messages;
      // Fall back to English for any key a translation has not caught up with,
      // so a missing string never renders as a raw key.
      const template = catalogue[key] ?? (en as Messages)[key] ?? String(key);
      return interpolate(template, vars);
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/** Convenience hook for components that only need to translate. */
export function useT(): Translate {
  return useI18n().t;
}
