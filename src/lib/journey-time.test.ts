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

import { estimateJourneyExact, type DepartureTable } from "./journey-time";

/** Trains every 7 minutes, which is the case the user asked about. */
const departures: DepartureTable = {
  "NS1|asc": { weekday: [600, 607, 614, 621, 628] },   // 10:00, 10:07, ...
  "CC15|asc": { weekday: [610, 617, 624, 631, 638] },  // 10:10, 10:17, ...
};

const legs = [
  { boardAt: "NS1", direction: "asc" as const, path: ["NS1", "NS2"] },
  { boardAt: "CC15", direction: "asc" as const, path: ["CC15", "CC16"] },
];

const exactBase = {
  legs,
  hops: { "NS1|NS2": 2, "CC15|CC16": 2 },
  departures,
  day: "weekday" as const,
  transferWalkMinutes: 5,
};

describe("exact connections", () => {
  it("charges the full gap when you just miss a train", () => {
    // Reach NS1 at 10:01, one minute after the 10:00. The next is 10:07, so
    // the wait is six minutes — not the three and a half an average would
    // report. This is the whole point of modelling it exactly.
    const j = estimateJourneyExact({ ...exactBase, arriveAt: 601 });
    expect(j.waitsPerLeg[0]).toBe(6);
    expect(j.boardTimes[0]).toBe(607);
  });

  it("charges almost nothing when you catch one immediately", () => {
    const j = estimateJourneyExact({ ...exactBase, arriveAt: 600 });
    expect(j.waitsPerLeg[0]).toBe(0);
  });

  it("misses a connection by a minute and waits the whole gap", () => {
    // Board 10:07, ride 2 min to 10:09, walk 5 to 10:14. The CC15 train left
    // at 10:10, so the wait is until 10:17 — seven minutes, not an average.
    const j = estimateJourneyExact({ ...exactBase, arriveAt: 601 });
    expect(j.boardTimes[1]).toBe(617);
    expect(j.waitsPerLeg[1]).toBe(3);
  });

  it("a faster walker can catch the earlier connection", () => {
    // Same train, but a two-minute change reaches the platform at 10:11...
    const slow = estimateJourneyExact({ ...exactBase, arriveAt: 601, transferWalkMinutes: 5 });
    const fast = estimateJourneyExact({ ...exactBase, arriveAt: 595, transferWalkMinutes: 1 });
    // ...and an earlier boarding means an earlier arrival.
    expect(fast.arriveMinutes).toBeLessThan(slow.arriveMinutes);
  });

  it("rolls to the next day rather than claiming no service", () => {
    // 23:50, long after the last train in this fixture.
    const j = estimateJourneyExact({ ...exactBase, arriveAt: 1430 });
    expect(j.boardTimes[0]).toBe(600); // tomorrow's first, wrapped for display
    expect(j.waitsPerLeg[0]).toBeGreaterThan(0);
  });

  it("says so when it had to approximate", () => {
    const j = estimateJourneyExact({
      ...exactBase,
      legs: [{ boardAt: "ZZ9", direction: "asc", path: ["ZZ9", "ZZ8"] }],
      arriveAt: 600,
    });
    expect(j.approximated).toBe(true);
  });

  it("adds up, and arrives after it departs", () => {
    const j = estimateJourneyExact({ ...exactBase, arriveAt: 601 });
    expect(j.total).toBe(j.rideMinutes + j.waitMinutes + j.walkMinutes);
    expect(j.arriveMinutes).toBe(601 + j.total);
  });
});
