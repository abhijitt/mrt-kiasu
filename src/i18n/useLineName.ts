"use client";

import { LINES, lineNameKey, type LineCode } from "@/lib/lines";
import { useI18n, type MessageKey } from "./I18nProvider";

/**
 * A line's name in the reader's language, with the English kept alongside.
 *
 * Every line here has an English name printed on the station walls, on the
 * network map and on the trains themselves, and that is the name a commuter
 * will have heard even if they read the app in another language. Showing only
 * "滨海市区线" or "Laluan Pusat Bandar" hands someone a name they may never
 * have seen on a sign. So the translation leads and the English follows.
 *
 * Returns the single name when the two are the same, so English readers get
 * "Downtown Line" and not "Downtown Line · Downtown Line".
 */
export function useLineName(): (code: LineCode) => string {
  const { t, locale } = useI18n();

  return (code: LineCode) => {
    const translated = t(lineNameKey(code) as MessageKey);
    const english = LINES[code].name;
    if (locale === "en" || translated === english) return translated;
    return `${translated} · ${english}`;
  };
}
