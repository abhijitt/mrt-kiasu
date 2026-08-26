/**
 * Published adjustments that supersede the timetable.
 *
 * LTA's alert feed says which line is adjusted and for how long, but puts the
 * replacement times only in prose ("end at 11.30pm on Friday nights"). Parsing
 * that automatically would mean turning free text from an external source into
 * numbers we present as fact, so the times are transcribed by hand into
 * src/data/service-adjustments.json with the alert text as the citation, and
 * this module only ever reads them.
 *
 * Pure and clock-free: every function takes the date it should reason about.
 */

import data from "@/data/service-adjustments.json";
import type { LineCode } from "./lines";
import type { TrainTime } from "./service-status";

export type AdjustmentEffect = "modified-schedule" | "closed";

export type DayName =
  | "sunday" | "monday" | "tuesday" | "wednesday"
  | "thursday" | "friday" | "saturday";

const DAY_NAMES: DayName[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export interface ScheduleOverride {
  days: DayName[];
  first?: string;
  last?: string;
}

export interface ServiceAdjustment {
  id: string;
  lines: LineCode[];
  activeFrom: string;
  activeTo: string;
  effect: AdjustmentEffect;
  overrides?: ScheduleOverride[];
  source: string;
  sourceNote: string;
  citedOn: string;
}

const ADJUSTMENTS = data.adjustments as ServiceAdjustment[];

/** The day name in Singapore time, which is the only timezone this app serves. */
export function dayNameOf(date: Date): DayName {
  return DAY_NAMES[date.getDay()]!;
}

/** Local calendar date as YYYY-MM-DD, so comparison never crosses a timezone. */
export function isoDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Whether an adjustment applies on a given date.
 *
 * Both ends are inclusive, and an expired entry is simply not in force — a
 * stale row in the data file can never change an answer, it can only be
 * reported by the validator so somebody removes it.
 */
export function isInForce(adjustment: ServiceAdjustment, date: Date): boolean {
  const today = isoDateOf(date);
  return today >= adjustment.activeFrom && today <= adjustment.activeTo;
}

/** Adjustments in force on this date for this line. */
export function adjustmentsFor(line: LineCode, date: Date): ServiceAdjustment[] {
  return ADJUSTMENTS.filter((a) => a.lines.includes(line) && isInForce(a, date));
}

/** Every adjustment in force, regardless of line. */
export function activeAdjustments(date: Date): ServiceAdjustment[] {
  return ADJUSTMENTS.filter((a) => isInForce(a, date));
}

export interface AdjustedTime extends TrainTime {
  /** The adjustment that replaced a time here, if one did. */
  adjustedBy?: ServiceAdjustment;
}

/**
 * Applies any in-force schedule override to one timetable row.
 *
 * Only the fields an adjustment actually names are replaced: an alert that
 * changes Friday's last train says nothing about Friday's first, and inventing
 * a value for the other end would be exactly the failure this file exists to
 * prevent. Returns the row unchanged, and without a marker, when nothing
 * applies.
 */
export function applyAdjustment(
  row: TrainTime,
  line: LineCode,
  date: Date,
): AdjustedTime {
  const day = dayNameOf(date);

  for (const adjustment of adjustmentsFor(line, date)) {
    if (adjustment.effect !== "modified-schedule") continue;
    for (const override of adjustment.overrides ?? []) {
      if (!override.days.includes(day)) continue;
      if (override.first === undefined && override.last === undefined) continue;
      return {
        towards: row.towards,
        first: override.first ?? row.first,
        last: override.last ?? row.last,
        adjustedBy: adjustment,
      };
    }
  }
  return row;
}

/** Part of this line is not running today. */
export function closuresFor(line: LineCode, date: Date): ServiceAdjustment[] {
  return adjustmentsFor(line, date).filter((a) => a.effect === "closed");
}
