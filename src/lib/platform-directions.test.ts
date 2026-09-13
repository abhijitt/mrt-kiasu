import { describe, expect, it } from "vitest";
import { platformDirections } from "@/lib/network";
import { getStation, stationsOnLine } from "@/lib/stations";
import { hasTrainGeometry, LINES, type LineCode } from "@/lib/lines";

const label = (code: string) =>
  Object.fromEntries(platformDirections(code).map((p) => [p.direction, p.nextStop.code]));

describe("both platforms are reachable at a through station", () => {
  it("offers asc and desc", () => {
    expect(label("NS17")).toEqual({ desc: "NS16", asc: "NS18" });
    expect(label("DT15")).toEqual({ desc: "DT14", asc: "DT16" });
  });
});

describe("a terminus has one platform, not two", () => {
  it("offers only the direction trains actually leave in", () => {
    // NE2 is a reserved code that was never built, so HarbourFront's next
    // stop is NE3 — the reason this walks the ordered line, not the number.
    expect(label("NE1")).toEqual({ asc: "NE3" }); // HarbourFront
    expect(label("NE18")).toEqual({ desc: "NE17" }); // Punggol Coast
    expect(label("DT1")).toEqual({ asc: "DT2" });   // Bukit Panjang
  });
});

describe("branches, which sorting alone gets wrong", () => {
  it("sends the Changi branch back to Tanah Merah, not down the main line", () => {
    // LTA's own headsign at Expo reads "Tanah Merah", which is EW4.
    expect(label("CG1")).toEqual({ desc: "EW4", asc: "CG2" });
    expect(label("CG2")).toEqual({ desc: "CG1" });
  });

  it("keeps the main line as the default at a junction", () => {
    // Tanah Merah can send you to EW5 or onto the branch; the main line wins.
    expect(label("EW4")).toEqual({ desc: "EW3", asc: "EW5" });
    // Promenade likewise: CC5 onward and CC3 back, not the far side of the
    // loop — which is what LTA's own first/last train data calls its platforms.
    expect(label("CC4")).toEqual({ desc: "CC3", asc: "CC5" });
  });

  it("closes the Circle Line loop at Bayfront", () => {
    // Past CC34 the numbers wrap back to CC4, but the train keeps going the
    // same way round, so that is still the ascending platform.
    expect(label("CC34")).toEqual({ desc: "CC33", asc: "CC4" });
    expect(label("CC33")).toEqual({ desc: "CC32", asc: "CC34" });
    // And the loop is joined up rather than stopping dead at HarbourFront.
    expect(label("CC29")).toEqual({ desc: "CC28", asc: "CC30" });
  });
});

describe("every surveyable platform is reachable", () => {
  it("gives at least one direction for every station we can survey", () => {
    const lines = Object.keys(LINES).filter((l) => hasTrainGeometry(l as LineCode));
    const missing: string[] = [];
    for (const line of lines) {
      for (const s of stationsOnLine(line as LineCode)) {
        if (platformDirections(s.code).length === 0) missing.push(s.code);
      }
    }
    expect(missing).toEqual([]);
  });

  it("never points a platform at a station on another line", () => {
    for (const line of Object.keys(LINES) as LineCode[]) {
      if (!hasTrainGeometry(line)) continue;
      for (const s of stationsOnLine(line)) {
        for (const p of platformDirections(s.code)) {
          expect(getStation(p.nextStop.code)!.line).toBe(line);
        }
      }
    }
  });

  it("never lists the same direction twice", () => {
    for (const code of ["NS17", "EW4", "CC4", "CG1", "CC34"]) {
      const dirs = platformDirections(code).map((p) => p.direction);
      expect(new Set(dirs).size).toBe(dirs.length);
    }
  });
});
