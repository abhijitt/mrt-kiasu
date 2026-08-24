/**
 * Station trivia.
 *
 * Everything here is quoted from a cited source or derived from sourced data
 * already in the app. Nothing is written by us and nothing is paraphrased into
 * a claim the source does not make.
 */

import triviaData from "@/data/trivia.json";
import translatedData from "@/data/trivia.translated.json";
import { STATIONS, getStation } from "./stations";
import type { Locale } from "@/i18n/config";

export interface StationTrivia {
  /** Lead summary, quoted from Wikipedia. */
  summary: string;
  url: string;
  depth?: string;
  platforms?: string;
  structure?: string;
}

const BY_NAME = triviaData.stations as Record<string, StationTrivia>;

type TranslatedFields = { summary?: string; structure?: string };
const TRANSLATED = translatedData.locales as Record<string, Record<string, TranslatedFields>>;

/**
 * Station trivia in the requested language.
 *
 * Falls back field-by-field to the English original, so a station that has not
 * been translated yet shows English prose rather than a blank section. The
 * `translated` flag lets the UI say which it is — machine translation is not
 * presented as though a person wrote it.
 */
export type LocalisedTrivia = StationTrivia & { translated: boolean };

/**
 * One station's trivia in every language.
 *
 * The server hands this to the client component so the browser never has to
 * import the full 175-station dataset just to render one page.
 */
export function getTriviaAllLocales(
  code: string,
): Partial<Record<Locale, LocalisedTrivia>> {
  const out: Partial<Record<Locale, LocalisedTrivia>> = {};
  for (const locale of ["en", "zh", "ms", "ta"] as Locale[]) {
    const entry = getTrivia(code, locale);
    if (entry) out[locale] = entry;
  }
  return out;
}

/**
 * Years since this station opened, but only when today is that anniversary.
 *
 * Computed from the opening date already in the dataset, so it needs no new
 * data and stays correct if a date is ever corrected.
 */
export function anniversaryYears(code: string, today = new Date()): number | null {
  const station = getStation(code);
  if (!station?.opened) return null;

  const opened = new Date(station.opened);
  if (Number.isNaN(opened.getTime())) return null;
  if (opened.getMonth() !== today.getMonth() || opened.getDate() !== today.getDate()) {
    return null;
  }

  const years = today.getFullYear() - opened.getFullYear();
  return years > 0 ? years : null;
}

export function getTrivia(
  code: string,
  locale: Locale = "en",
): LocalisedTrivia | null {
  const station = getStation(code);
  if (!station) return null;

  const base = BY_NAME[station.name];
  if (!base) return null;

  if (locale === "en") return { ...base, translated: false };

  const localised = TRANSLATED[locale]?.[station.name];
  if (!localised) return { ...base, translated: false };

  return {
    ...base,
    summary: localised.summary ?? base.summary,
    structure: localised.structure ?? base.structure,
    translated: Boolean(localised.summary),
  };
}

export interface DerivedFact {
  /** Message key for the label. */
  labelKey: string;
  /** Interpolation values for the message. */
  vars?: Record<string, string | number>;
}

/**
 * Facts computed from sourced data rather than restated, so they stay correct
 * if the underlying dataset is corrected.
 */
export function derivedFacts(code: string): DerivedFact[] {
  const station = getStation(code);
  if (!station?.opened) return [];

  const facts: DerivedFact[] = [];
  const sameLine = STATIONS.filter((s) => s.line === station.line && s.opened);
  if (sameLine.length === 0) return facts;

  const dates = sameLine.map((s) => new Date(s.opened!).getTime());
  const opened = new Date(station.opened).getTime();

  if (opened === Math.max(...dates) && opened !== Math.min(...dates)) {
    facts.push({ labelKey: "trivia.newestOnLine" });
  }
  return facts;
}
