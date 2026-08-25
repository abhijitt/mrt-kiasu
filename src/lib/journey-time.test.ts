import { describe, expect, it } from "vitest";
import {
  estimateJourney,
  FALLBACK_HEADWAY_MINUTES,
  FALLBACK_HOP_MINUTES,
} from "./journey-time";

const hops = { "NS1|NS2": 2, "NS2|NS3": 3, "NS3|NS4": 2, "CC15|CC16": 2 };
const headway = {
  NS: { weekday: { "9": 3, "14": 5 }, saturday: {}, sunday: {} },
  CC: { weekday: { "9": 4, "14": 6 }, saturday: {}, sunday: {} },
};

const base = {
  hops,
  headway,
  day: "weekday" as const,
  transfers: [] as (readonly [string, string])[],
  transferWalkMinutes: 5,
};

describe("journey time", () => {
  it("sums real run times rather than a flat per-stop guess", () => {
    const j = estimateJourney({ ...base, path: ["NS1", "NS2", "NS3", "NS4"], hour: 9 });
    expect(j.rideMinutes).toBe(7); // 2 + 3 + 2, not 3 x 2.2
    expect(j.unknownHops).toBe(0);
  });

  it("charges for waiting, which used to be free", () => {
    // The old model implied a train was always sitting at the platform.
    const j = estimateJourney({ ...base, path: ["NS1", "NS2"], hour: 9 });
    expect(j.waitMinutes).toBe(2); // half of a 3-minute headway, rounded
    expect(j.total).toBeGreaterThan(j.rideMinutes);
  });

  it("takes longer off-peak, because trains are less frequent", () => {
    const path = ["NS1", "NS2", "NS3"];
    const peak = estimateJourney({ ...base, path, hour: 9 });
    const quiet = estimateJourney({ ...base, path, hour: 14 });
    expect(quiet.total).toBeGreaterThan(peak.total);
    // The ride itself is unchanged — only the wait moves.
    expect(quiet.rideMinutes).toBe(peak.rideMinutes);
  });

  it("counts a transfer as a walk and a second wait, not a train ride", () => {
    const j = estimateJourney({
      ...base,
      path: ["NS1", "NS2", "CC15", "CC16"],
      hour: 9,
      transfers: [["NS2", "CC15"]],
    });
    expect(j.walkMinutes).toBe(5);
    // Two boardings: NS1 (headway 3) and CC15 (headway 4) -> 1.5 + 2 = 3.5
    expect(j.waitMinutes).toBe(4);
    // NS2->CC15 is the transfer, so only NS1->NS2 and CC15->CC16 are rides.
    expect(j.rideMinutes).toBe(4);
  });

  it("scales the transfer walk with the walker, not the timetable", () => {
    const path = ["NS1", "NS2", "CC15", "CC16"];
    const transfers = [["NS2", "CC15"]] as (readonly [string, string])[];
    const brisk = estimateJourney({ ...base, path, hour: 9, transfers, transferWalkMinutes: 3 });
    const steady = estimateJourney({ ...base, path, hour: 9, transfers, transferWalkMinutes: 8 });
    expect(steady.walkMinutes - brisk.walkMinutes).toBe(5);
    // Waiting for the connecting train is not a walk and must not move.
    expect(steady.waitMinutes).toBe(brisk.waitMinutes);
  });

  it("reports hops the timetable does not cover", () => {
    const j = estimateJourney({ ...base, path: ["NS1", "XX9"], hour: 9 });
    expect(j.unknownHops).toBe(1);
    expect(j.rideMinutes).toBe(FALLBACK_HOP_MINUTES);
  });

  it("falls back to a headway when the hour has no entry", () => {
    const j = estimateJourney({ ...base, path: ["NS1", "NS2"], hour: 3 });
    expect(j.waitMinutes).toBe(Math.round(FALLBACK_HEADWAY_MINUTES / 2));
  });

  it("adds up", () => {
    const j = estimateJourney({
      ...base,
      path: ["NS1", "NS2", "CC15", "CC16"],
      hour: 14,
      transfers: [["NS2", "CC15"]],
    });
    expect(j.total).toBe(j.rideMinutes + j.waitMinutes + j.walkMinutes);
  });
});
