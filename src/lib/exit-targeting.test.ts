import { describe, expect, it } from "vitest";
import { findExitGuidance, getFeatures } from "@/lib/positions";
import { toCarPosition } from "@/lib/doors";
import { getStation } from "@/lib/stations";
import { landmarksFor } from "@/lib/landmarks";

describe("choosing an exit re-targets the door", () => {
  it("gives a different car for exits at opposite ends of a platform", () => {
    // Bishan NS17 has exits spread along the station.
    const cars = new Set<number>();
    for (const exit of ["A", "B", "C", "D"]) {
      const f = findExitGuidance("NS17", "asc", "escalator", exit);
      if (f) cars.add(toCarPosition(f.doorIndex, "NSL", "asc").car);
    }
    // If every exit produced the same car, the picker would be decorative.
    expect(cars.size).toBeGreaterThan(1);
  });

  it("mirrors the car when the train runs the other way", () => {
    const asc = findExitGuidance("NS17", "asc", "escalator", "A")!;
    const desc = findExitGuidance("NS17", "desc", "escalator", "A")!;
    // Same physical spot, so the same stored index...
    expect(asc.doorIndex).toBe(desc.doorIndex);
    // ...but opposite ends of the train.
    const a = toCarPosition(asc.doorIndex, "NSL", "asc");
    const d = toCarPosition(desc.doorIndex, "NSL", "desc");
    expect(a.car + d.car).toBe(a.totalCars + 1);
  });

  it("has an estimate for every exit the picker can offer", () => {
    // Otherwise a commuter could pick a landmark and get nothing back.
    for (const code of ["NS17", "CC15", "NE12", "EW24"]) {
      const station = getStation(code)!;
      const features = getFeatures(code, "asc");
      const covered = new Set(features.flatMap((f) => f.leadsTo));
      for (const exit of station.exits) {
        expect(covered.has(exit.code), `${code} exit ${exit.code}`).toBe(true);
      }
    }
  });

  it("only offers landmarks for exits that exist at that station", () => {
    for (const code of ["NS17", "NE12", "EW24"]) {
      const station = getStation(code)!;
      const valid = new Set(station.exits.map((e) => e.code));
      for (const l of landmarksFor(code)) {
        expect(valid.has(l.exit), `${code}: "${l.name}" -> exit ${l.exit}`).toBe(true);
      }
    }
  });

  it("lists each landmark once per station, keeping its nearest exit", () => {
    // Deduplication is what lets the per-station budget reach further out.
    for (const code of ["NS17", "NE12", "CC19"]) {
      const seen = new Set<string>();
      for (const l of landmarksFor(code)) {
        const key = `${l.name}|${l.kind}`;
        expect(seen.has(key), `${code}: "${l.name}" repeated`).toBe(false);
        seen.add(key);
      }
    }
  });

  it("keeps landmarks that are further out but worth riding to", () => {
    // Regression: a 350 m cut-off and a per-exit cap hid the MOE campus on
    // Evans Road, ~600 m from Botanic Gardens, behind garden micro-features.
    const bg = landmarksFor("CC19");
    expect(bg.some((l) => l.name.includes("Ministry of Education"))).toBe(true);
    expect(Math.max(...bg.map((l) => l.metres))).toBeGreaterThan(500);
  });

  it("sorts landmarks nearest first", () => {
    for (const code of ["NS22", "CC19", "NE12"]) {
      const list = landmarksFor(code);
      const sorted = [...list].sort((a, b) => a.metres - b.metres);
      expect(list.map((l) => l.metres)).toEqual(sorted.map((l) => l.metres));
    }
  });
});

/**
 * Aljunied, surveyed from both faces on 2026-09-17.
 *
 * One island platform holding the two cases the door model exists for: a lift
 * whose shaft faces one side, so the best door genuinely differs by direction,
 * and a staircase at the far end that really does reach both exits but is
 * ~90 m from them. Neither can be expressed by a door number alone.
 */
describe("Aljunied's one lift and its far staircase", () => {
  it("gives each face its own door for the same shaft", () => {
    const asc = findExitGuidance("EW9", "asc", "lift", "A")!;
    const desc = findExitGuidance("EW9", "desc", "lift", "A")!;
    // One physical lift, so one id...
    expect(asc.id).toBe("EW9-lift-1");
    expect(desc.id).toBe(asc.id);
    // ...but the door faces the Kallang-bound side, so the other side walks
    // around the shaft. This is a stagger, not a mirror: a mirrored door 9
    // would be 16, at the wrong end of the platform entirely.
    expect(asc.doorIndex).toBe(9);
    expect(desc.doorIndex).toBe(10);
  });

  it("sends people to the near staircase, not the one at the far end", () => {
    // Both reach A and B. Only one of them is a reasonable walk.
    for (const direction of ["asc", "desc"] as const) {
      for (const exit of ["A", "B"]) {
        expect(findExitGuidance("EW9", direction, "stairs", exit)!.doorIndex).toBe(19);
      }
    }
  });

  it("keeps the far staircase in the dataset rather than hiding it", () => {
    // Omitting it would be a lie by omission: it is a real way out, and the
    // only one for someone already standing at that end of the platform.
    const far = getFeatures("EW9", "desc").find((f) => f.doorIndex === 6)!;
    expect(far.type).toBe("stairs");
    expect(far.leadsTo).toEqual(["A", "B"]);
    expect(far.secondaryFor).toHaveLength(2);
  });

  it("puts the escalator at the same spot for both directions", () => {
    const asc = findExitGuidance("EW9", "asc", "escalator", "A")!;
    const desc = findExitGuidance("EW9", "desc", "escalator", "A")!;
    expect(asc.doorIndex).toBe(desc.doorIndex);
    // The platform is elevated, so the way out is down. The rule that assumed
    // otherwise would have refused to offer this at all.
    expect(asc.travel).toBe("down");
    expect(toCarPosition(asc.doorIndex, "EWL", "asc").car).not.toBe(
      toCarPosition(desc.doorIndex, "EWL", "desc").car,
    );
  });
});
