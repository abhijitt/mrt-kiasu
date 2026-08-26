import { describe, expect, it } from "vitest";
// The validator is a plain .mjs script, kept dependency-free so it can run
// without a build. TypeScript infers its exports well enough to test them.
import { DAY_SYNONYMS, LINE_ALIASES, dateAliases, mentions } from "../../scripts/validate-data.mjs";

/**
 * The rules that keep service-adjustments.json honest.
 *
 * Every stated time, day and line has to be readable in the LTA alert stored
 * as its citation. The time check alone was never enough: the mistake that
 * actually happens when someone — or something — reads dense prose is a
 * correct figure attached to the wrong day or the wrong line, and that passes
 * a check that only looks for "23:30".
 */

const DTL =
  "23:30-DTL-Planned Service Adjustments. From 10 Jul to 5 Sep 2026, Downtown Line services will end at 11.30pm on Friday nights and commence at 8.30am on Saturday mornings.";
const SKLRT =
  "05:00-SK-Planned Service Adjustment. From 19 Apr to 18 Oct 2026, the Sengkang West LRT Inner Loop (i.e. direction of STC Sengkang towards SW1 Cheng Lim) will be closed.";

const cites = (note: string, phrases: string[]) =>
  phrases.some((p: string) => mentions(note, p));

describe("mentions matches whole words only", () => {
  it("does not match inside another word", () => {
    // "NE" must not be found in "Renjong", or every LRT alert would cite the
    // North East Line.
    expect(mentions("towards SW8 Renjong", "NE")).toBe(false);
    expect(mentions("SK-Planned", "SK")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(mentions(DTL, "friday")).toBe(true);
    expect(mentions(DTL, "FRIDAY")).toBe(true);
  });
});

describe("the line must be citable", () => {
  it("accepts the forms LTA actually writes", () => {
    expect(cites(DTL, LINE_ALIASES.DTL)).toBe(true);   // "DTL", "Downtown Line"
    expect(cites(SKLRT, LINE_ALIASES.SKLRT)).toBe(true); // "SK", "Sengkang"
  });

  it("rejects a different line's alert", () => {
    expect(cites(DTL, LINE_ALIASES.NEL)).toBe(false);
    expect(cites(DTL, LINE_ALIASES.NSL)).toBe(false);
    expect(cites(SKLRT, LINE_ALIASES.PGLRT)).toBe(false);
  });
});

describe("the day must be citable", () => {
  it("accepts days the alert names", () => {
    expect(cites(DTL, DAY_SYNONYMS.friday)).toBe(true);
    expect(cites(DTL, DAY_SYNONYMS.saturday)).toBe(true);
  });

  it("rejects a day it never names — the misattribution case", () => {
    // The exact failure: right time, wrong day.
    expect(cites(DTL, DAY_SYNONYMS.monday)).toBe(false);
    expect(cites(DTL, DAY_SYNONYMS.sunday)).toBe(false);
  });

  it("accepts a collective term that genuinely covers the day", () => {
    const weekdays = "services will end at 11.30pm on weekdays.";
    expect(cites(weekdays, DAY_SYNONYMS.friday)).toBe(true);
    expect(cites(weekdays, DAY_SYNONYMS.saturday)).toBe(false);
    const weekend = "services start later at weekends.";
    expect(cites(weekend, DAY_SYNONYMS.sunday)).toBe(true);
    expect(cites(weekend, DAY_SYNONYMS.monday)).toBe(false);
  });
});

describe("the date should be citable", () => {
  it("matches the way LTA writes a date, without a leading zero", () => {
    expect(cites(DTL, dateAliases("2026-07-10"))).toBe(true); // "10 Jul"
    expect(cites(DTL, dateAliases("2026-09-05"))).toBe(true); // "5 Sep"
    expect(cites(SKLRT, dateAliases("2026-04-19"))).toBe(true);
    expect(cites(SKLRT, dateAliases("2026-10-18"))).toBe(true);
  });

  it("rejects a date the alert never gives", () => {
    expect(cites(DTL, dateAliases("2026-06-01"))).toBe(false);
  });
});

describe("every line in the app has aliases", () => {
  it("covers each line code, so no line can skip the check", () => {
    const codes = [
      "NSL", "EWL", "NEL", "CCL", "DTL", "TEL", "BPLRT", "SKLRT", "PGLRT",
    ] as const satisfies readonly (keyof typeof LINE_ALIASES)[];
    for (const c of codes) {
      expect(LINE_ALIASES[c], `no aliases for ${c}`).toBeDefined();
      expect(LINE_ALIASES[c]).toContain(c);
    }
  });
});
