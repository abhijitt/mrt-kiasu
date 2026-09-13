import { describe, expect, it } from "vitest";
import { directionBetween, positionOnLine, reachesAlong } from "./network";
import { planRouteBetweenStations } from "./routing";

/**
 * Direction decides which platform's timetable, features and door side a leg
 * uses, so getting it backwards does not look like a bug — it looks like a
 * train time, for a train going the other way.
 */

describe("direction along a line with a branch", () => {
  it("orders by prefix before number", () => {
    // EWL is ["EW", "CG"], so every CG station sits after every EW one however
    // small its number. Comparing bare numbers called CG1 "before" EW4.
    expect(positionOnLine("EW4")).toEqual([0, 4]);
    expect(positionOnLine("CG1")).toEqual([1, 1]);
  });

  it("knows the Changi branch runs back down toward Tanah Merah", () => {
    // The regression: 1 and 4 alone read as ascending, which sent the app to
    // the Changi Airport platform for a passenger heading to Tanah Merah.
    expect(directionBetween("CG1", "EW4")).toBe("desc");
    expect(directionBetween("EW4", "CG1")).toBe("asc");
  });

  it("keeps going the same way round where the loop numbers wrap", () => {
    // Stage 6 closed the loop: a train leaving CC34 Bayfront arrives at CC4
    // Promenade still travelling anticlockwise, so that hop ascends even
    // though the number drops by thirty. Reading the numbers alone would put
    // the commuter on the opposite platform.
    expect(directionBetween("CC34", "CC4")).toBe("asc");
    expect(directionBetween("CC4", "CC34")).toBe("desc");
    // The rest of the loop is ordinary.
    expect(directionBetween("CC29", "CC33")).toBe("asc");
    expect(directionBetween("CC33", "CC29")).toBe("desc");
  });

  it("still works within a single prefix", () => {
    expect(directionBetween("NS10", "NS16")).toBe("asc");
    expect(directionBetween("NS16", "NS10")).toBe("desc");
  });
});

describe("a planned leg carries the right direction", () => {
  it("sends an Expo passenger down the branch, not up it", () => {
    const route = planRouteBetweenStations("Expo", "Tanah Merah")!;
    expect(route.legs).toHaveLength(1);
    // Boarding at CG1 heading for Tanah Merah is descending; asc would read
    // the Changi Airport platform's departures instead.
    expect(route.legs[0].direction).toBe("desc");
  });

  it("sends a Tanah Merah passenger up the branch", () => {
    const route = planRouteBetweenStations("Tanah Merah", "Expo")!;
    expect(route.legs[0].direction).toBe("asc");
  });
});

/**
 * Short workings. The Circle Line runs a lot of partial services — Dhoby
 * Ghaut, Prince Edward Road and Stadium account for nearly every one on the
 * network — and a train that terminates before your stop is a real departure
 * at a real time that cannot take you.
 */
describe("whether a train gets far enough", () => {
  it("keeps a train that runs past the stop", () => {
    // Ascending from Dhoby Ghaut, a train to CC29 passes CC21.
    expect(reachesAlong("CC29", "CC21", "asc")).toBe(true);
  });

  it("rejects one that terminates short of it", () => {
    // A service terminating at Stadium leaves a CC21 passenger stranded.
    expect(reachesAlong("CC6", "CC21", "asc")).toBe(false);
  });

  it("counts terminating exactly at the stop as reaching it", () => {
    expect(reachesAlong("CC21", "CC21", "asc")).toBe(true);
    expect(reachesAlong("CC21", "CC21", "desc")).toBe(true);
  });

  it("reads the other way round when descending", () => {
    // Descending, "far enough" means a lower position, not a higher one.
    expect(reachesAlong("CC1", "CC6", "desc")).toBe(true);
    expect(reachesAlong("CC12", "CC6", "desc")).toBe(false);
  });

  it("respects the branch when deciding how far is far enough", () => {
    // A train terminating at Tanah Merah does not reach Changi Airport, even
    // though CG2 is numerically smaller than EW4.
    expect(reachesAlong("EW4", "CG2", "asc")).toBe(false);
    expect(reachesAlong("CG2", "CG1", "asc")).toBe(true);
  });
});

describe("a code can be real without being in our list", () => {
  it("places a station the code file has not caught up with", () => {
    // LTA's GTFS runs trains to CC32 (Prince Edward Road). Their station-code
    // file still stops at CC29 plus the retired CE1/CE2, so looking CC32 up
    // finds nothing there.
    // Reading the prefix from the line instead of the station keeps it on the
    // Circle Line where it belongs.
    expect(positionOnLine("CC32")).toEqual([0, 32]);
  });

  it("does not strand a train terminating at one", () => {
    // The regression: an unknown code scored prefix index -1, which sorts
    // before every station on its own line, so a service to CC32 was judged
    // unable to reach stops it runs straight through — and those departures
    // were dropped from the timetable the planner reads.
    expect(reachesAlong("CC32", "CC21", "asc")).toBe(true);
    expect(reachesAlong("CC32", "CC29", "asc")).toBe(true);
    // Still false where it genuinely is short: Stadium is CC6.
    expect(reachesAlong("CC6", "CC21", "asc")).toBe(false);
  });

  it("refuses a prefix belonging to no line at all", () => {
    expect(positionOnLine("ZZ9")).toEqual([-1, 9]);
  });
});
