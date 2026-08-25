import { describe, expect, it } from "vitest";
import { addJourney, EMPTY_SCORE, MAX_PER_JOURNEY, minutes } from "./kiasu-score";

describe("kiasu score", () => {
  it("accumulates seconds and journeys", () => {
    let s = EMPTY_SCORE;
    s = addJourney(s, 58, "2026-08-25");
    s = addJourney(s, 42, "2026-08-26");
    expect(s.seconds).toBe(100);
    expect(s.journeys).toBe(2);
  });

  it("remembers only the first date", () => {
    let s = addJourney(EMPTY_SCORE, 30, "2026-08-25");
    s = addJourney(s, 30, "2026-09-01");
    expect(s.since).toBe("2026-08-25");
  });

  it("ignores figures the route screen would never have shown", () => {
    for (const bad of [0, -5, NaN, Infinity]) {
      expect(addJourney(EMPTY_SCORE, bad, "2026-08-25")).toEqual(EMPTY_SCORE);
    }
  });

  it("caps a single journey, so an upstream bug cannot become permanent", () => {
    const s = addJourney(EMPTY_SCORE, 10_000, "2026-08-25");
    expect(s.seconds).toBe(MAX_PER_JOURNEY);
    expect(s.journeys).toBe(1);
  });

  it("reports whole minutes, rounding down", () => {
    expect(minutes({ seconds: 59, journeys: 1, since: "" })).toBe(0);
    expect(minutes({ seconds: 61, journeys: 1, since: "" })).toBe(1);
    expect(minutes({ seconds: 600, journeys: 9, since: "" })).toBe(10);
  });

  it("never mutates the score it was given", () => {
    const start = EMPTY_SCORE;
    addJourney(start, 60, "2026-08-25");
    expect(start).toEqual({ seconds: 0, journeys: 0, since: "" });
  });
});
