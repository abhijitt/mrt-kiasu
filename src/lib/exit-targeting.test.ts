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
