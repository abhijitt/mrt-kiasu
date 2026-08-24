/**
 * Door-position maths.
 *
 * The problem this solves: a given escalator sits at ONE physical spot on a
 * platform, but the car number a commuter needs depends on which way their
 * train is pointing. Storing "car 4" would be wrong half the time.
 *
 * So positions are stored once per physical platform as a `doorIndex`:
 *   1..N counted from the platform's REFERENCE END.
 *
 * The reference end is defined, unambiguously and direction-independently, as
 * the end of the platform facing the LOWER station code on that line — e.g. on
 * the North East Line, the end pointing toward NE1 HarbourFront. A surveyor
 * only has to answer "which end points toward HarbourFront?", which they can
 * read off the platform's own direction signs.
 *
 * Car numbers are then derived per direction of travel. Nothing downstream
 * stores a car number.
 */

import { LINES, doorsPerTrain, type LineCode } from "./lines";

/** Throws for lines with no sourced fleet data rather than assuming one. */
function requireTotal(line: LineCode): number {
  const total = doorsPerTrain(line);
  if (total === null) {
    throw new Error(
      `No sourced train geometry for ${line} — refusing to compute door positions.`,
    );
  }
  return total;
}

function requireTrain(line: LineCode): { cars: number; doorsPerCar: number } {
  const train = LINES[line].train;
  if (!train) {
    throw new Error(
      `No sourced train geometry for ${line} — refusing to compute door positions.`,
    );
  }
  return train;
}

/**
 * Direction of travel expressed in terms of station-code numbering.
 *  - "asc"  — toward higher station numbers (NE1 -> NE18, i.e. toward Punggol)
 *  - "desc" — toward lower station numbers  (NE18 -> NE1, i.e. toward HarbourFront)
 */
export type Direction = "asc" | "desc";

export interface CarPosition {
  /** 1 = frontmost car in the direction of travel. */
  car: number;
  /** 1 = frontmost door within that car. */
  doorInCar: number;
  /** Total cars, for rendering "car 4 of 6". */
  totalCars: number;
  /** Position along the train from the front, 1..N. */
  doorFromFront: number;
}

function assertValidIndex(doorIndex: number, total: number): void {
  if (!Number.isInteger(doorIndex) || doorIndex < 1 || doorIndex > total) {
    throw new RangeError(
      `doorIndex must be an integer in 1..${total}, received ${doorIndex}`,
    );
  }
}

/**
 * Mirrors a door index to the opposite end of the platform.
 * This is an involution: mirror(mirror(i)) === i.
 */
export function mirrorDoorIndex(doorIndex: number, line: LineCode): number {
  const total = requireTotal(line);
  assertValidIndex(doorIndex, total);
  return total + 1 - doorIndex;
}

/**
 * Converts a stored platform position into the car and door a commuter
 * should stand at, given which way their train is travelling.
 */
export function toCarPosition(
  doorIndex: number,
  line: LineCode,
  direction: Direction,
): CarPosition {
  const total = requireTotal(line);
  assertValidIndex(doorIndex, total);

  const { cars, doorsPerCar } = requireTrain(line);

  // doorIndex is measured from the low-code end. When travelling "asc" the
  // train's nose points at the high-code end, so the front of the train is
  // the far end from where we count — mirror before deriving the car.
  const doorFromFront = direction === "asc" ? total + 1 - doorIndex : doorIndex;

  return {
    car: Math.ceil(doorFromFront / doorsPerCar),
    doorInCar: ((doorFromFront - 1) % doorsPerCar) + 1,
    totalCars: cars,
    doorFromFront,
  };
}

/**
 * Inverse of {@link toCarPosition} — used by the survey tool, where a
 * surveyor records what they can actually see ("car 3, second door") and we
 * need to store the direction-independent index.
 */
export function fromCarPosition(
  car: number,
  doorInCar: number,
  line: LineCode,
  direction: Direction,
): number {
  const { cars, doorsPerCar } = requireTrain(line);
  if (!Number.isInteger(car) || car < 1 || car > cars) {
    throw new RangeError(`car must be an integer in 1..${cars}, received ${car}`);
  }
  if (!Number.isInteger(doorInCar) || doorInCar < 1 || doorInCar > doorsPerCar) {
    throw new RangeError(
      `doorInCar must be an integer in 1..${doorsPerCar}, received ${doorInCar}`,
    );
  }

  const total = requireTotal(line);
  const doorFromFront = (car - 1) * doorsPerCar + doorInCar;
  return direction === "asc" ? total + 1 - doorFromFront : doorFromFront;
}

/**
 * Fractional position (0..1) of a door along the platform from the reference
 * end, for laying out the platform diagram. Doors are placed at the centre of
 * their slot so the first and last markers sit inside the platform rather than
 * flush against its ends.
 */
export function doorFraction(doorIndex: number, line: LineCode): number {
  const total = requireTotal(line);
  assertValidIndex(doorIndex, total);
  return (doorIndex - 0.5) / total;
}

/**
 * Human-readable instruction. Deliberately avoids a bare door number: MRT
 * platforms carry no official door numbering, so "door 14" would refer to
 * nothing the commuter can see. Car counts and ordinal doors are readable
 * off the train itself.
 */
export function describePosition(pos: CarPosition): string {
  const ordinals = ["1st", "2nd", "3rd", "4th", "5th"];
  const ordinal = ordinals[pos.doorInCar - 1] ?? `${pos.doorInCar}th`;
  return `Car ${pos.car} of ${pos.totalCars} · ${ordinal} door`;
}
