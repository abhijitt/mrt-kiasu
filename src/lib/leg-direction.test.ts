import { describe, expect, it } from "vitest";
import { directionBetween, positionOnLine } from "./network";
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

  it("handles the Circle Line extension the same way", () => {
    // CCL is ["CC", "CE"]; CE1 is beyond CC29 despite the number.
    expect(directionBetween("CC4", "CE1")).toBe("asc");
    expect(directionBetween("CE1", "CC4")).toBe("desc");
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
