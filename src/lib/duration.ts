/**
 * Human-readable durations.
 *
 * "286 min" is technically correct and useless — nobody converts that in their
 * head at a station entrance. Past an hour it becomes hours and minutes.
 */

export interface DurationParts {
  hours: number;
  minutes: number;
}

export function splitDuration(totalMinutes: number): DurationParts {
  const safe = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

/**
 * Which message shape to use, so the caller can pick a translated string.
 *
 * Three cases rather than one, because "4 h 0 min" reads badly and every
 * language handles the exact-hour case differently.
 */
export type DurationShape = "minutes" | "hours" | "hoursAndMinutes";

export function durationShape(totalMinutes: number): DurationShape {
  const { hours, minutes } = splitDuration(totalMinutes);
  if (hours === 0) return "minutes";
  return minutes === 0 ? "hours" : "hoursAndMinutes";
}
