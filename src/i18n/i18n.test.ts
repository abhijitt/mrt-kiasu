import { describe, expect, it } from "vitest";
import en from "./messages/en.json";
import zh from "./messages/zh.json";
import ms from "./messages/ms.json";
import ta from "./messages/ta.json";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, detectLocale, isLocale } from "./config";

const CATALOGUES: Record<string, Record<string, string>> = { en, zh, ms, ta };
const KEYS = Object.keys(en) as (keyof typeof en)[];

/** Placeholders like {count} that a translation must preserve. */
function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("message catalogues", () => {
  it("covers every locale listed in config", () => {
    for (const locale of LOCALES) {
      expect(CATALOGUES[locale], `no catalogue for ${locale}`).toBeDefined();
      expect(LOCALE_NAMES[locale]).toBeDefined();
      expect(LOCALE_SHORT[locale]).toBeDefined();
    }
  });

  it("has no missing keys in any language", () => {
    for (const locale of LOCALES) {
      const missing = KEYS.filter((k) => !(k in CATALOGUES[locale]));
      expect(missing, `${locale} is missing keys`).toEqual([]);
    }
  });

  it("has no stray keys that English does not define", () => {
    for (const locale of LOCALES) {
      const extra = Object.keys(CATALOGUES[locale]).filter(
        (k) => !(k in en),
      );
      expect(extra, `${locale} has keys not in en`).toEqual([]);
    }
  });

  it("keeps the same placeholders in every translation", () => {
    // A dropped {count} silently renders a sentence with a hole in it.
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        expect(
          placeholders(CATALOGUES[locale][key]),
          `${locale}."${key}" placeholders differ from English`,
        ).toEqual(placeholders(en[key]));
      }
    }
  });

  it("has no empty strings", () => {
    for (const locale of LOCALES) {
      const blank = KEYS.filter((k) => CATALOGUES[locale][k].trim() === "");
      expect(blank, `${locale} has blank values`).toEqual([]);
    }
  });

  it("actually translates — non-English catalogues are not English copies", () => {
    for (const locale of LOCALES.filter((l) => l !== "en")) {
      const identical = KEYS.filter((k) => CATALOGUES[locale][k] === en[k]);
      // A few tokens legitimately match (e.g. "Auto"), but most must differ.
      expect(identical.length).toBeLessThan(KEYS.length * 0.15);
    }
  });
});

describe("detectLocale", () => {
  it("matches on the primary subtag", () => {
    expect(detectLocale(["zh-Hans-SG", "en-SG"])).toBe("zh");
    expect(detectLocale(["ta-IN"])).toBe("ta");
    expect(detectLocale(["ms-MY"])).toBe("ms");
    expect(detectLocale(["en-GB"])).toBe("en");
  });

  it("takes the first supported language in preference order", () => {
    expect(detectLocale(["fr-FR", "de-DE", "ta"])).toBe("ta");
  });

  it("falls back to English when nothing matches or the list is empty", () => {
    expect(detectLocale(["fr-FR", "de-DE"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts supported locales and rejects anything else", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
