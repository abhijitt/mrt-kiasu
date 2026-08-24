import { describe, expect, it } from "vitest";
import {
  doorFraction,
  describePosition,
  fromCarPosition,
  mirrorDoorIndex,
  toCarPosition,
  type Direction,
} from "./doors";
import { LINES, doorsPerTrain, lineFromStationCode, type LineCode } from "./lines";

// Only lines with sourced fleet data can have door maths applied at all.
const ALL_LINES = (Object.keys(LINES) as LineCode[]).filter(
  (l) => LINES[l].train !== null,
);
const DIRECTIONS: Direction[] = ["asc", "desc"];

describe("mirrorDoorIndex", () => {
  it("is an involution on every line", () => {
    for (const line of ALL_LINES) {
      for (let i = 1; i <= doorsPerTrain(line)!; i++) {
        expect(mirrorDoorIndex(mirrorDoorIndex(i, line), line)).toBe(i);
      }
    }
  });

  it("maps the ends to each other", () => {
    for (const line of ALL_LINES) {
      const n = doorsPerTrain(line)!;
      expect(mirrorDoorIndex(1, line)).toBe(n);
      expect(mirrorDoorIndex(n, line)).toBe(1);
    }
  });

  it("rejects out-of-range indices", () => {
    expect(() => mirrorDoorIndex(0, "NEL")).toThrow(RangeError);
    expect(() => mirrorDoorIndex(25, "NEL")).toThrow(RangeError);
    expect(() => mirrorDoorIndex(1.5, "NEL")).toThrow(RangeError);
  });
});

describe("toCarPosition", () => {
  it("puts the reference end at car 1 when travelling toward lower codes", () => {
    // NEL: 6 cars x 4 doors. doorIndex 1 sits at the HarbourFront end, so a
    // train heading to HarbourFront has its nose there.
    expect(toCarPosition(1, "NEL", "desc")).toMatchObject({
      car: 1,
      doorInCar: 1,
      doorFromFront: 1,
    });
  });

  it("mirrors when travelling toward higher codes", () => {
    // Same physical spot, train pointing the other way: it is now the very
    // back of the train.
    expect(toCarPosition(1, "NEL", "asc")).toMatchObject({
      car: 6,
      doorInCar: 4,
      doorFromFront: 24,
    });
  });

  it("derives car boundaries correctly", () => {
    // NEL doors 1-4 are car 1, 5-8 are car 2, and so on.
    expect(toCarPosition(4, "NEL", "desc")).toMatchObject({ car: 1, doorInCar: 4 });
    expect(toCarPosition(5, "NEL", "desc")).toMatchObject({ car: 2, doorInCar: 1 });
    expect(toCarPosition(24, "NEL", "desc")).toMatchObject({ car: 6, doorInCar: 4 });
  });

  it("handles TEL's 5-doors-per-car geometry", () => {
    // TEL is the only line with 5 doors per car, so off-by-one errors in the
    // modulo arithmetic show up here and nowhere else.
    expect(doorsPerTrain("TEL")).toBe(20);
    expect(toCarPosition(5, "TEL", "desc")).toMatchObject({ car: 1, doorInCar: 5 });
    expect(toCarPosition(6, "TEL", "desc")).toMatchObject({ car: 2, doorInCar: 1 });
    expect(toCarPosition(20, "TEL", "desc")).toMatchObject({ car: 4, doorInCar: 5 });
  });

  it("handles 3-car lines", () => {
    expect(doorsPerTrain("DTL")).toBe(12);
    expect(toCarPosition(12, "DTL", "desc")).toMatchObject({ car: 3, doorInCar: 4 });
    expect(toCarPosition(1, "DTL", "asc")).toMatchObject({ car: 3, doorInCar: 4 });
  });

  it("refuses to compute positions for lines with no sourced fleet data", () => {
    // LRT car and door counts are unsourced, so guessing would be worse than
    // declining. The throw is the guarantee.
    expect(doorsPerTrain("BPLRT")).toBeNull();
    expect(() => toCarPosition(1, "BPLRT", "asc")).toThrow(/No sourced train geometry/);
    expect(() => mirrorDoorIndex(1, "SKLRT")).toThrow(/No sourced train geometry/);
  });

  it("never reports a car outside the trainset on any line or direction", () => {
    for (const line of ALL_LINES) {
      const { cars, doorsPerCar } = LINES[line].train!;
      for (const direction of DIRECTIONS) {
        for (let i = 1; i <= doorsPerTrain(line)!; i++) {
          const pos = toCarPosition(i, line, direction);
          expect(pos.car).toBeGreaterThanOrEqual(1);
          expect(pos.car).toBeLessThanOrEqual(cars);
          expect(pos.doorInCar).toBeGreaterThanOrEqual(1);
          expect(pos.doorInCar).toBeLessThanOrEqual(doorsPerCar);
        }
      }
    }
  });

  it("assigns every door position exactly once per direction", () => {
    // Guards against two different platform spots collapsing onto one car/door.
    for (const line of ALL_LINES) {
      for (const direction of DIRECTIONS) {
        const seen = new Set<string>();
        for (let i = 1; i <= doorsPerTrain(line)!; i++) {
          const pos = toCarPosition(i, line, direction);
          seen.add(`${pos.car}-${pos.doorInCar}`);
        }
        expect(seen.size).toBe(doorsPerTrain(line)!);
      }
    }
  });
});

describe("fromCarPosition", () => {
  it("round-trips with toCarPosition across every line and direction", () => {
    for (const line of ALL_LINES) {
      for (const direction of DIRECTIONS) {
        for (let i = 1; i <= doorsPerTrain(line)!; i++) {
          const pos = toCarPosition(i, line, direction);
          expect(fromCarPosition(pos.car, pos.doorInCar, line, direction)).toBe(i);
        }
      }
    }
  });

  it("rejects cars and doors outside the trainset", () => {
    expect(() => fromCarPosition(7, 1, "NEL", "desc")).toThrow(RangeError);
    expect(() => fromCarPosition(1, 5, "NEL", "desc")).toThrow(RangeError);
    // 5 doors is valid on TEL but not on NEL.
    expect(() => fromCarPosition(1, 5, "TEL", "desc")).not.toThrow();
  });
});

describe("doorFraction", () => {
  it("stays strictly inside the platform and increases monotonically", () => {
    for (const line of ALL_LINES) {
      let previous = 0;
      for (let i = 1; i <= doorsPerTrain(line)!; i++) {
        const f = doorFraction(i, line);
        expect(f).toBeGreaterThan(0);
        expect(f).toBeLessThan(1);
        expect(f).toBeGreaterThan(previous);
        previous = f;
      }
    }
  });

  it("is symmetric about the platform centre", () => {
    for (const line of ALL_LINES) {
      const n = doorsPerTrain(line)!;
      for (let i = 1; i <= n; i++) {
        expect(doorFraction(i, line) + doorFraction(mirrorDoorIndex(i, line), line)).toBeCloseTo(1);
      }
    }
  });
});

describe("describePosition", () => {
  it("never emits a bare door number, which platforms do not display", () => {
    const text = describePosition(toCarPosition(14, "NEL", "asc"));
    expect(text).toBe("Car 3 of 6 · 3rd door");
    expect(text).not.toMatch(/door 14/i);
  });

  it("uses correct ordinals up to TEL's fifth door", () => {
    expect(describePosition(toCarPosition(5, "TEL", "desc"))).toContain("5th door");
    expect(describePosition(toCarPosition(2, "TEL", "desc"))).toContain("2nd door");
  });
});

describe("lineFromStationCode", () => {
  it("resolves real station codes", () => {
    expect(lineFromStationCode("NE12")).toBe("NEL");
    expect(lineFromStationCode("NS1")).toBe("NSL");
    expect(lineFromStationCode("TE20")).toBe("TEL");
  });

  it("resolves LRT codes to their line but withholds train geometry", () => {
    // LRT stations are real and routable; only their fleet data is missing.
    expect(lineFromStationCode("PW3")).toBe("PGLRT");
    expect(lineFromStationCode("BP7")).toBe("BPLRT");
    expect(lineFromStationCode("STC")).toBe("SKLRT");
    expect(doorsPerTrain("PGLRT")).toBeNull();
  });

  it("returns null for codes that are not stations at all", () => {
    expect(lineFromStationCode("ZZ9")).toBeNull();
  });
});
