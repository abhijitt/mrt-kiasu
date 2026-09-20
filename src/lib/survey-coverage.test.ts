import { describe, expect, it, vi } from "vitest";

// The module is server-only; stub the guard so it can be imported under test.
vi.mock("server-only", () => ({}));

const { stationCoverage, surveyCoverage } = await import("./survey-coverage");

/**
 * What "surveyed" is allowed to mean.
 *
 * The number this produces is the app's own claim about how far it can be
 * trusted, so the rules behind it have to be the strict ones. A platform with
 * one escalator recorded can answer "where is an escalator" and still have
 * nothing for someone heading to Exit D — counting that as mapped would let
 * the figure climb while the app stayed useless.
 */

describe("survey coverage", () => {
  const coverage = surveyCoverage();

  it("counts a platform complete only when every exit and transfer is reachable", () => {
    for (const row of coverage.inProgress) {
      expect(row.complete).toBe(false);
      // In progress means started, so an untouched platform is not in this list.
      expect(row.features).toBeGreaterThan(0);
      expect(
        row.exitsCovered < row.exitsTotal || row.transfersCovered < row.transfersTotal,
      ).toBe(true);
    }
  });

  it("never reports more complete than started", () => {
    expect(coverage.platforms.complete).toBeLessThanOrEqual(coverage.platforms.started);
    expect(coverage.stations.complete).toBeLessThanOrEqual(coverage.stations.started);
    expect(coverage.platforms.started).toBeLessThanOrEqual(coverage.platforms.total);
  });

  it("leaves out platforms nobody could survey", () => {
    // A door position cannot be surveyed for a train whose door count is not
    // published, so counting those as outstanding would make the figure
    // unreachable by construction.
    expect(coverage.notSurveyable).toBeGreaterThan(0);
  });

  it("holds Paya Lebar up as fully mapped on both lines", () => {
    // The first station anyone walked end to end. If a change makes this fail,
    // either the data regressed or the definition moved — both worth knowing.
    expect(coverage.completeStations).toContain("EW8");
    expect(coverage.completeStations).toContain("CC9");
  });

  it("reaches every exit and transfer at Paya Lebar's East West platforms", () => {
    for (const c of stationCoverage("EW8")) {
      expect(c.started).toBe(true);
      expect(c.exitsCovered).toBe(c.exitsTotal);
      expect(c.transfersCovered).toBe(c.transfersTotal);
      expect(c.complete).toBe(true);
    }
  });

  it("says nothing for a line with no train geometry", () => {
    // LRT: no fleet data, so no platform to report on rather than an empty one.
    expect(stationCoverage("BP1")).toEqual([]);
  });
});

/**
 * Routing from a platform and having stood on it are different claims.
 *
 * An island platform's far face can be filled in from the near one, which is
 * enough to route someone — so its meter reads 100% — without anyone having
 * been there. The two were both called "mapped", which is how the station
 * page came to say one platform was surveyed directly above a meter reading
 * 100% for two.
 *
 * The thirteen mirrored records in the dataset were reviewed and confirmed on
 * 2026-09-19, so none remain. The field stays because the review tool still
 * writes inferences for a newly approved survey, and this asserts that none
 * reaches the shipped dataset without someone having looked at it.
 */
describe("surveyed here is not the same as covered", () => {
  it("has no platform the app routes from that nobody has checked", () => {
    for (const code of ["CC2", "CC6", "EW8", "EW9", "CC9"]) {
      for (const c of stationCoverage(code)) {
        if (c.started) expect({ code: c.code, dir: c.direction, surveyed: c.surveyedHere })
          .toEqual({ code: c.code, dir: c.direction, surveyed: true });
      }
    }
  });

  it("counts both faces at a station surveyed from both", () => {
    // Aljunied, which is how the staggered lift was caught — the inference
    // had its door a place out until the second face was walked.
    const both = stationCoverage("EW9");
    expect(both.filter((c) => c.surveyedHere)).toHaveLength(2);
    expect(both.every((c) => c.complete)).toBe(true);
  });

  it("claims nothing for a platform nobody has recorded", () => {
    const none = stationCoverage("EW30");
    expect(none.every((c) => !c.surveyedHere && !c.started)).toBe(true);
  });
});

/**
 * The settings page says "All LRT lines are left out" as a flat statement
 * rather than listing what it derived, which is easier to read and true only
 * as long as nothing else lacks a published train.
 *
 * This is where that holds. If an MRT line ever arrives without fleet data —
 * a new line before LTA publishes its rolling stock, say — the sentence
 * becomes a lie and this fails, rather than the page quietly under-reporting
 * what it cannot survey.
 */
describe("the lines left out are the LRT, and only the LRT", () => {
  it("excludes every LRT line", () => {
    const excluded = surveyCoverage().notSurveyableLines;
    expect([...excluded].sort()).toEqual(["BPLRT", "PGLRT", "SKLRT"]);
  });

  it("excludes nothing that is not an LRT line", () => {
    for (const line of surveyCoverage().notSurveyableLines) {
      expect(line.endsWith("LRT")).toBe(true);
    }
  });
});
