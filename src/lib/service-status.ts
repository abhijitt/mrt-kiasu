/**
 * Whether you can still get a train, and whether you are about to lose one.
 *
 * Pure, so the reasoning is testable without a clock or a browser. Everything
 * here is derived from LTA's published timetable plus the app's own rough
 * ride-time model, and the model's roughness is the reason the copy says
 * "may" rather than "will".
 */

import type { LineCode } from "./lines";

export type ServiceDay = "weekday" | "saturday" | "sunday";

export interface TrainTime {
  towards: string;
  first: string;
  last: string;
  /**
   * Which line the row came from, where the caller knows.
   *
   * A published adjustment applies to a line, and an interchange merges rows
   * from several — without this, a Downtown Line adjustment at Promenade would
   * be applied to the Circle Line rows beside it.
   */
  line?: LineCode;
}

export type Status =
  /** Trains are running and the last one is not imminent. */
  | { kind: "running" }
  /** Before the first train of the day. */
  | { kind: "beforeFirst"; first: string; minutesUntil: number }
  /** The last train has already gone. */
  | { kind: "afterLast"; last: string }
  /** Still running, but not for much longer. */
  | { kind: "lastSoon"; last: string; minutesLeft: number };

/** Warn this far ahead of the last train. */
export const LAST_TRAIN_WARNING_MINUTES = 45;

/** Which timetable applies. Public holidays follow the Sunday timetable. */
export function serviceDayOf(date: Date): ServiceDay {
  const day = date.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const DAY = 24 * 60;

/** Forward distance around a 24-hour clock, always 0..1439. */
function forward(from: number, to: number): number {
  return (to - from + DAY) % DAY;
}

/**
 * Whether trains are running, on a clock that wraps.
 *
 * A service from 05:42 to 00:37 spans midnight, so its window is not a simple
 * range — it is everything from 05:42 to the end of the day plus everything up
 * to 00:37. Treating it as first <= now <= last would call the whole night
 * "closed" and the whole day "open".
 */
function isRunning(now: number, first: number, last: number): boolean {
  return last >= first ? now >= first && now <= last : now >= first || now <= last;
}

/**
 * Service status for one direction at one station.
 *
 * `nowMinutes` is minutes since midnight local time.
 */
export function statusFor(
  row: TrainTime,
  nowMinutes: number,
  warnMinutes: number = LAST_TRAIN_WARNING_MINUTES,
): Status {
  const first = toMinutes(row.first);
  const last = toMinutes(row.last);

  if (isRunning(nowMinutes, first, last)) {
    const minutesLeft = forward(nowMinutes, last);
    return minutesLeft <= warnMinutes
      ? { kind: "lastSoon", last: row.last, minutesLeft }
      : { kind: "running" };
  }

  // Closed. Report whichever end of the gap is nearer, because that is the
  // one the reader is actually asking about: just-missed-it late at night, or
  // not-open-yet early in the morning.
  const sinceLast = forward(last, nowMinutes);
  const untilFirst = forward(nowMinutes, first);
  return sinceLast <= untilFirst
    ? { kind: "afterLast", last: row.last }
    : { kind: "beforeFirst", first: row.first, minutesUntil: untilFirst };
}

/** The most urgent status across several directions, for a whole-station view. */
export function worstStatus(statuses: Status[]): Status {
  const rank: Record<Status["kind"], number> = {
    afterLast: 3,
    beforeFirst: 2,
    lastSoon: 1,
    running: 0,
  };
  return statuses.reduce(
    (worst, s) => (rank[s.kind] > rank[worst.kind] ? s : worst),
    { kind: "running" } as Status,
  );
}

/**
 * Whether a connection is at risk.
 *
 * `minutesToReach` is how long the app thinks the first leg plus the transfer
 * takes. Both are approximations — LTA publishes no inter-station run times —
 * so this reports risk, never certainty, and errs toward warning.
 */
export function connectionAtRisk(
  connectingRow: TrainTime,
  nowMinutes: number,
  minutesToReach: number,
): boolean {
  const first = toMinutes(connectingRow.first);
  const last = toMinutes(connectingRow.last);
  // Not running at all is the clearest kind of risk.
  if (!isRunning(nowMinutes, first, last)) return true;
  return minutesToReach > forward(nowMinutes, last);
}
