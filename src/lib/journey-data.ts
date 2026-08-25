import "server-only";
import data from "@/data/train-times.json";
import { estimateJourneyExact, type DepartureTable, type Leg } from "./journey-time";
import { transferTime } from "./transfers";
import { serviceDayOf } from "./service-status";

/**
 * Server-side access to the timetable.
 *
 * The departure table is 1.4 MB — far too much to send — so this computes the
 * journey here and hands the page only the stations it touched, which is
 * around 9 KB for a two-change route. That subset is what lets Gao's planner
 * recompute a different departure time in the browser.
 */

const HOPS = data.hops as Record<string, number>;
const DEPARTURES = data.departures as DepartureTable;

export interface RouteLegShape {
  from: { code: string };
  direction: "asc" | "desc";
  stops: { code: string }[];
  to: { code: string };
}

function toLegs(legs: readonly RouteLegShape[]): Leg[] {
  return legs.map((l) => ({
    boardAt: l.from.code,
    direction: l.direction,
    path: [l.from.code, ...l.stops.map((s) => s.code), l.to.code],
  }));
}

export interface JourneyPayload {
  legs: Leg[];
  /** Only the hops and departures this route needs. */
  hops: Record<string, number>;
  departures: DepartureTable;
  day: "weekday" | "saturday" | "sunday";
  /** Minutes to change platforms, and whether that figure was measured. */
  transferWalkMinutes: number;
  transferMeasured: boolean;
}

/** Everything the client needs to recompute this journey at any departure time. */
export function journeyPayload(
  routeLegs: readonly RouteLegShape[],
  now: Date = new Date(),
): JourneyPayload {
  const legs = toLegs(routeLegs);
  const day = serviceDayOf(now);

  const hops: Record<string, number> = {};
  for (const leg of legs) {
    for (let i = 1; i < leg.path.length; i++) {
      const a = leg.path[i - 1];
      const b = leg.path[i];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (HOPS[key] !== undefined) hops[key] = HOPS[key];
    }
  }

  // Only the boarding platforms, and only for today's timetable.
  const departures: DepartureTable = {};
  for (const leg of legs) {
    const key = `${leg.boardAt}|${leg.direction}`;
    const times = DEPARTURES[key]?.[day];
    if (times) departures[key] = { [day]: times };
  }

  // One transfer figure for the route: the walk at each interchange.
  const firstTransfer =
    routeLegs.length > 1
      ? transferTime(routeLegs[0].to.code, routeLegs[1].from.code)
      : transferTime("", "");

  return {
    legs,
    hops,
    departures,
    day,
    transferWalkMinutes: firstTransfer.minutes,
    transferMeasured: firstTransfer.confidence === "measured",
  };
}

export { estimateJourneyExact };
