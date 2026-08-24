"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
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

/**
 * The chosen locale, read once from storage and the browser's own languages.
 *
 * Cached because useSyncExternalStore compares snapshots by identity and calls
 * getSnapshot on every render — re-reading localStorage each time would be
 * wasteful, and re-detecting would be worse.
 */
let localeSnapshot: Locale | null = null;
const localeListeners = new Set<() => void>();

function readLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
    return detectLocale(navigator.languages ?? [navigator.language]);
  } catch {
    // Blocked storage: fall back to the browser's languages alone.
    return detectLocale(
      typeof navigator !== "undefined"
        ? (navigator.languages ?? [navigator.language])
        : [],
    );
  }
}

function getLocaleSnapshot(): Locale {
  if (localeSnapshot === null) localeSnapshot = readLocale();
  return localeSnapshot;
}

/** The server cannot know the reader's language, so it renders the default. */
function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Server and first client render both produce DEFAULT_LOCALE, so hydration
  // matches; React then re-renders with the stored preference.
  const locale = useSyncExternalStore(
    subscribeLocale,
    getLocaleSnapshot,
    getServerLocaleSnapshot,
  );
  const ready = useSyncExternalStore(
    subscribeLocale,
    () => true,
    () => false,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    localeSnapshot = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal: the choice still applies for this session.
    }
    for (const listener of localeListeners) listener();
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
