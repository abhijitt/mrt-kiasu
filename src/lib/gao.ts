/**
 * The extra working shown in Gao mode.
 *
 * Everything here is arithmetic over figures the app already derives and
 * already cites — it reveals reasoning rather than asserting anything new.
 * Nothing in this module may introduce a claim the default mode would not
 * have made, which is why it takes no new data and reads no new sources.
 */

import { LINES, doorsPerTrain, type LineCode } from "./lines";
import type { Direction } from "./doors";
import {
  isLongWayTo,
  leadsToTarget,
  sameFeature,
  servesAlighting,
  type PlatformFeature,
} from "./feature-types";
import { trainLengthM, WALKING_SPEED_MS } from "./walking";

/** Which end of the train a door is counted from, once direction is applied. */
export interface DoorBreakdown {
  /** Position from the front of the moving train, 1-based. */
  fromFront: number;
  total: number;
}

export function doorBreakdown(
  doorIndex: number,
  line: LineCode,
  direction: Direction,
): DoorBreakdown | null {
  const total = doorsPerTrain(line);
  if (total === null) return null;
  const fromFront = direction === "asc" ? total + 1 - doorIndex : doorIndex;
  return { fromFront, total };
}

export interface SavedWorking {
  /** Whole train, metres. */
  lengthM: number;
  /** Centre to either end. */
  halfM: number;
  /** Signed distance of the door from the train's centre, after clamping. */
  offsetM: number;
  /**
   * The offset before clamping, present only when it fell outside the train.
   *
   * An exit-derived estimate can project well past either end. secondsSaved
   * clamps it, which is right — you cannot walk further than the train is
   * long — but a mode that exists to show its working must not present the
   * clamped number as though it were the measurement.
   */
  rawOffsetM?: number;
  /** Metres skipped versus the far end. */
  savedM: number;
  speedMs: number;
  seconds: number;
}

/**
 * Shows how the seconds-saved figure was reached.
 *
 * Mirrors secondsSaved exactly rather than recomputing it differently — if
 * these two ever disagree the app is lying in one of two places, so the
 * arithmetic is kept deliberately identical.
 */
export function savedWorking(offsetM: number, line: LineCode): SavedWorking | null {
  const lengthM = trainLengthM(line);
  if (lengthM === null) return null;

  const halfM = lengthM / 2;
  const position = Math.max(-halfM, Math.min(halfM, offsetM));
  const savedM = halfM + Math.abs(position);
  const wasClamped = Math.abs(offsetM) > halfM + 0.05;

  return {
    lengthM: round1(lengthM),
    halfM: round1(halfM),
    offsetM: round1(position),
    ...(wasClamped ? { rawOffsetM: round1(offsetM) } : {}),
    savedM: round1(savedM),
    speedMs: WALKING_SPEED_MS,
    seconds: Math.round(savedM / WALKING_SPEED_MS),
  };
}

export interface BackupDoor {
  doorIndex: number;
  /** How much worse than the optimal door, in seconds. */
  extraSeconds: number;
}

/**
 * The next-best door, for when the right one is already a scrum.
 *
 * An adjacent door costs one door-spacing of extra walking. It prefers the
 * neighbour toward the middle of the train, which is the one that still
 * exists when the target door sits at either end.
 */
export function backupDoor(doorIndex: number, line: LineCode): BackupDoor | null {
  const total = doorsPerTrain(line);
  const lengthM = trainLengthM(line);
  if (total === null || lengthM === null || total < 2) return null;

  const towardMiddle = doorIndex <= total / 2 ? doorIndex + 1 : doorIndex - 1;
  if (towardMiddle < 1 || towardMiddle > total) return null;

  const spacingM = lengthM / total;
  return {
    doorIndex: towardMiddle,
    extraSeconds: Math.max(1, Math.round(spacingM / WALKING_SPEED_MS)),
  };
}

export interface OtherWay {
  feature: PlatformFeature;
  /** Extra walking against the recommended door, in seconds. */
  extraSeconds: number;
  /** Same spot on the platform — a different device on one landing. */
  sameLanding: boolean;
  /** Reaches the target, but by the long way round. */
  longWay: boolean;
}

/**
 * The other ways off this platform that still reach where you are going.
 *
 * backupDoor() answers a narrow question — this door is a scrum, is the next
 * one along any good — and the answer is arithmetic, so it holds anywhere.
 * But it is the wrong question when the whole landing is packed: at Paya
 * Lebar, standing one door from a mobbed escalator leaves you in the same
 * crowd, while the stairs eleven doors down reach the same exits with nobody
 * on them. The platform data has known about that second landing all along
 * and the page never mentioned it.
 *
 * Only surveyed features, and only ones that reach the target: an estimate is
 * a guess at where an exit surfaces, and sending someone the length of a
 * platform on a guess is worse than saying nothing. Ranked by the walk, with
 * a landing that is the long way round ranked after one that is not, because
 * "further away" and "the wrong end of the station" are different costs.
 */
export function otherWaysOut(
  features: PlatformFeature[],
  chosen: PlatformFeature,
  target: string | null,
  line: LineCode,
): OtherWay[] {
  const total = doorsPerTrain(line);
  const lengthM = trainLengthM(line);
  if (total === null || lengthM === null) return [];
  const spacingM = lengthM / total;

  return features
    .filter(
      (f) =>
        !sameFeature(f, chosen) &&
        f.confidence !== "estimate" &&
        servesAlighting(f) &&
        (!target || leadsToTarget(f, target)),
    )
    .map((f) => ({
      feature: f,
      extraSeconds: Math.round((Math.abs(f.doorIndex - chosen.doorIndex) * spacingM) / WALKING_SPEED_MS),
      sameLanding: f.doorIndex === chosen.doorIndex,
      longWay: isLongWayTo(f, target),
    }))
    .sort(
      (a, b) =>
        Number(a.longWay) - Number(b.longWay) || a.extraSeconds - b.extraSeconds,
    );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Line names for the provenance block — the fleet figure's origin. */
export function fleetSource(line: LineCode): string | null {
  return LINES[line].trainSource ?? null;
}
