import { describe, expect, it } from "vitest";
import exitsData from "../data/exits.json";
import stationsData from "../data/stations.json";
import { STATIONS, getStation } from "./stations";

/**
 * Guards the places where our data deliberately disagrees with LTA's.
 *
 * LTA's published files go stale, and both importers fetch live. Re-running
 * one is a normal thing to do — but without the supplements each carries, a
 * re-import silently reverts real corrections: the Circle Line loses Stage 6
 * and goes back to CE1/CE2, and Paya Lebar loses two exits. Nothing else in
 * the suite notices, because the resulting data is internally consistent; it
 * is just wrong about Singapore.
 *
 * So these assert the corrections themselves. If LTA ever catches up, both
 * importers drop their supplement on the next run and these stay green.
 */

describe("Circle Line Stage 6 survives a re-import", () => {
  it("numbers the extension into the closed loop", () => {
    expect(getStation("CC34")?.name).toBe("Bayfront");
    expect(getStation("CC33")?.name).toBe("Marina Bay");
    expect(STATIONS.some((s) => s.code === "CE1" || s.code === "CE2")).toBe(false);
  });

  it("keeps the three stations LTA's code file omits", () => {
    for (const [code, name] of [
      ["CC30", "Keppel"],
      ["CC31", "Cantonment"],
      ["CC32", "Prince Edward Road"],
    ] as const) {
      const station = getStation(code);
      expect(station, `${code} is missing`).not.toBeNull();
      expect(station!.name).toBe(name);
      expect(station!.opened).toBe("2026-07-12");
      // No exits to average, so the GTFS stop coordinate is all the map has.
      expect(station!.center).not.toBeNull();
    }
  });
});

describe("exits LTA has not published yet", () => {
  it("gives Paya Lebar exits E and F on both platforms", () => {
    for (const code of ["EW8", "CC9"]) {
      const codes = getStation(code)!.exits.map((e) => e.code);
      expect(codes, `${code} exits`).toEqual(["A", "B", "C", "D", "E", "F"]);
    }
  });

  it("marks every supplemented exit as not coming from LTA", () => {
    const supplement = exitsData._source.supplement ?? [];
    expect(supplement.length).toBeGreaterThan(0);
    for (const entry of supplement) {
      // A supplement without its evidence is an invention, which is the one
      // thing this dataset is not allowed to contain.
      expect(entry.evidence, `${entry.station} ${entry.code}`).toBeTruthy();
      const station = stationsData.stations.find(
        (s) => s.name === entry.station && s.exits.some((e) => e.code === entry.code),
      );
      expect(station, `${entry.station} exit ${entry.code}`).toBeTruthy();
      const exit = station!.exits.find((e) => e.code === entry.code)!;
      expect(exit).toHaveProperty("source", entry.source);
    }
  });

  it("leaves LTA's own exits unmarked", () => {
    const a = getStation("EW8")!.exits.find((e) => e.code === "A")!;
    expect(a.source).toBeUndefined();
  });
});
