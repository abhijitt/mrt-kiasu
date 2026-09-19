import { describe, expect, it } from "vitest";
import { backupDoor, doorBreakdown, otherWaysOut, savedWorking } from "./gao";
import type { PlatformFeature } from "./feature-types";
import { secondsSaved, trainLengthM } from "./walking";
import { toCarPosition } from "./doors";
import { LINES, doorsPerTrain, type LineCode } from "./lines";

// The LRT lines carry train: null — LTA publishes no fleet geometry for them,
// and the app refuses to guess. Truthiness, not an undefined check.
const WITH_TRAINS = (Object.keys(LINES) as LineCode[]).filter((l) => LINES[l].train);

describe("gao working", () => {
  it("agrees with the figure the default mode shows", () => {
    // If these ever diverge the app contradicts itself on the same screen —
    // one number in the summary, a different one in the explanation.
    for (const line of WITH_TRAINS) {
      for (const offset of [-60, -12.5, 0, 7.25, 60]) {
        const working = savedWorking(offset, line);
        expect(working, line).not.toBeNull();
        expect(working!.seconds, `${line} @ ${offset}`).toBe(secondsSaved(offset, line));
      }
    }
  });

  it("shows a breakdown that adds up", () => {
    const w = savedWorking(10, "NSL")!;
    expect(w.halfM).toBeCloseTo(w.lengthM / 2, 1);
    // Saved is the half-length plus however far you stand from centre.
    expect(w.savedM).toBeCloseTo(w.halfM + Math.abs(w.offsetM), 1);
    expect(w.seconds).toBe(Math.round(w.savedM / w.speedMs));
  });

  it("clamps an offset that falls outside the train", () => {
    const length = trainLengthM("NSL")!;
    const w = savedWorking(length, "NSL")!;
    expect(Math.abs(w.offsetM)).toBeLessThanOrEqual(length / 2 + 0.05);
  });

  it("returns nothing for a line with no fleet data", () => {
    const noTrain = (Object.keys(LINES) as LineCode[]).find((l) => !LINES[l].train);
    expect(noTrain, "expected at least one line without fleet data").toBeDefined();
    expect(savedWorking(5, noTrain!)).toBeNull();
    expect(backupDoor(3, noTrain!)).toBeNull();
  });
});

describe("door breakdown", () => {
  it("matches the car position the app already derives", () => {
    for (const line of WITH_TRAINS) {
      const total = doorsPerTrain(line)!;
      for (const dir of ["asc", "desc"] as const) {
        for (const idx of [1, Math.ceil(total / 2), total]) {
          const b = doorBreakdown(idx, line, dir)!;
          expect(b.fromFront, `${line} ${dir} ${idx}`).toBe(
            toCarPosition(idx, line, dir).doorFromFront,
          );
          expect(b.total).toBe(total);
        }
      }
    }
  });

  it("mirrors between directions", () => {
    const total = doorsPerTrain("NSL")!;
    const asc = doorBreakdown(1, "NSL", "asc")!;
    const desc = doorBreakdown(1, "NSL", "desc")!;
    expect(asc.fromFront + desc.fromFront).toBe(total + 1);
  });
});

describe("backup door", () => {
  it("is always adjacent and always on the train", () => {
    for (const line of WITH_TRAINS) {
      const total = doorsPerTrain(line)!;
      for (let idx = 1; idx <= total; idx++) {
        const b = backupDoor(idx, line)!;
        expect(Math.abs(b.doorIndex - idx), `${line} ${idx}`).toBe(1);
        expect(b.doorIndex).toBeGreaterThanOrEqual(1);
        expect(b.doorIndex).toBeLessThanOrEqual(total);
      }
    }
  });

  it("steps inward at both ends, where there is only one neighbour", () => {
    const total = doorsPerTrain("NSL")!;
    expect(backupDoor(1, "NSL")!.doorIndex).toBe(2);
    expect(backupDoor(total, "NSL")!.doorIndex).toBe(total - 1);
  });

  it("costs at least a second, never zero", () => {
    for (const line of WITH_TRAINS) {
      expect(backupDoor(2, line)!.extraSeconds).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("clamp disclosure", () => {
  it("reports the raw offset when the estimate falls outside the train", () => {
    // Real case: Serangoon's exit-derived estimate projects -169m, well past
    // the end of a 70m train. Showing only the clamped 35.1m would present a
    // capped number as though it were the measurement.
    const w = savedWorking(-169, "CCL")!;
    expect(w.rawOffsetM).toBe(-169);
    expect(Math.abs(w.offsetM)).toBeLessThanOrEqual(w.halfM + 0.05);
  });

  it("stays quiet when no clamping happened", () => {
    const w = savedWorking(5, "CCL")!;
    expect(w.rawOffsetM).toBeUndefined();
    expect(w.offsetM).toBe(5);
  });

  it("does not change the seconds the default mode shows", () => {
    // Disclosure only — the figure itself must be untouched.
    for (const offset of [-169, -35, 0, 200]) {
      expect(savedWorking(offset, "CCL")!.seconds).toBe(secondsSaved(offset, "CCL"));
    }
  });
});

/**
 * The other way off the platform.
 *
 * backupDoor answers "this door is a scrum, is the next one along any good",
 * which is arithmetic and holds anywhere. It is the wrong question when the
 * crowd is at the landing rather than the door: standing one door from a
 * mobbed escalator leaves you in the same crowd. Paya Lebar's East West
 * platform has the answer recorded — stairs eleven doors away reaching the
 * same exits — and the page never mentioned them.
 */
describe("other ways off the platform", () => {
  const base = {
    source: "survey",
    confidence: "verified",
    verifiedAt: "2026-09-15",
    sourceNote: "Field survey",
  } as const;

  const escalator: PlatformFeature = {
    ...base, type: "escalator", doorIndex: 10, leadsTo: ["A", "E"], travel: "down",
  };
  const stairsHere: PlatformFeature = {
    ...base, type: "stairs", doorIndex: 10, leadsTo: ["A", "E"],
  };
  const farStairs: PlatformFeature = {
    ...base, type: "stairs", doorIndex: 21, leadsTo: ["A", "E"],
  };
  const otherExit: PlatformFeature = {
    ...base, type: "escalator", doorIndex: 2, leadsTo: ["B"], travel: "down",
  };
  const platform = [escalator, stairsHere, farStairs, otherExit];

  it("names the far landing that reaches the same exit", () => {
    const ways = otherWaysOut(platform, escalator, "A", "EWL");
    expect(ways.map((w) => w.feature.doorIndex)).toEqual([10, 21]);
    expect(ways.find((w) => w.feature.doorIndex === 21)!.extraSeconds).toBeGreaterThan(30);
  });

  it("marks the device on the same landing as no walk at all", () => {
    const here = otherWaysOut(platform, escalator, "A", "EWL")[0];
    expect(here.sameLanding).toBe(true);
    expect(here.extraSeconds).toBe(0);
    expect(here.feature.type).toBe("stairs");
  });

  it("leaves out what does not reach where you are going", () => {
    // The escalator at door 2 serves exit B. Offering it to someone heading
    // for A would send them out of the wrong end of the station.
    expect(otherWaysOut(platform, escalator, "A", "EWL").map((w) => w.feature)).not.toContain(
      otherExit,
    );
    expect(otherWaysOut(platform, escalator, "B", "EWL").map((w) => w.feature)).toEqual([otherExit]);
  });

  it("never offers an estimate as the backup", () => {
    // A guess at where an exit surfaces is not something to walk a platform
    // for. It is fine as the headline answer, clearly marked; it is not fine
    // as "go here instead".
    const guess: PlatformFeature = {
      type: "exit", doorIndex: 20, leadsTo: ["A"], source: "estimate",
      confidence: "estimate", sourceNote: "projected", offsetM: -30,
    };
    expect(otherWaysOut([escalator, guess], escalator, "A", "EWL")).toEqual([]);
  });

  it("ranks the long way round after a plain longer walk", () => {
    const demoted: PlatformFeature = { ...farStairs, doorIndex: 12, secondaryFor: ["A"] };
    const ways = otherWaysOut([escalator, demoted, farStairs], escalator, "A", "EWL");
    // Door 12 is the shorter walk, but it is the wrong end of the station.
    expect(ways[0].feature.doorIndex).toBe(21);
    expect(ways.at(-1)!.longWay).toBe(true);
  });

  it("does not offer the door you are already standing at", () => {
    expect(otherWaysOut([escalator], escalator, "A", "EWL")).toEqual([]);
  });
});
