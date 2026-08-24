/**
 * Internationalisation config.
 *
 * Singapore has four official languages, so the app ships all four. No
 * user-facing string is written inline anywhere in the app — every one lives
 * in a message catalogue keyed by the ids in `messages/en.json`, so adding a
 * fifth language means adding one file and one entry here.
 */

export const LOCALES = ["en", "zh", "ms", "ta"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  zh: { native: "中文", english: "Chinese" },
  ms: { native: "Melayu", english: "Malay" },
  ta: { native: "தமிழ்", english: "Tamil" },
};

/** Short label for the language switcher button. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  zh: "中",
  ms: "MS",
  ta: "த",
};

export const STORAGE_KEY = "mrt-kiasu:locale";

/**
 * Picks a locale from the browser's language preferences.
 *
 * Matches on the primary subtag so "zh-Hans-SG", "zh-TW" and "zh" all resolve
 * to Chinese. Falls back to English when nothing matches.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split("-")[0];
    const match = LOCALES.find((l) => l === primary);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
