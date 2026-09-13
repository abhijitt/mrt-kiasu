import "server-only";
import data from "@/data/train-times.json";
import { estimateJourneyExact, type DepartureTable, type Leg } from "./journey-time";
import { transferTime } from "./transfers";
import { serviceDayOf } from "./service-status";
import { reachesAlong } from "./network";

/**
 * Server-side access to the timetable.
 *
 * The departure table is 1.4 MB — far too much to send — so this computes the
 * journey here and hands the page only the stations it touched, which is
 * around 9 KB for a two-change route. That subset is what lets Gao's planner
 * recompute a different departure time in the browser.
 */

const HOPS = data.hops as Record<string, number>;
const HOP_SECONDS = data.hopSeconds as Record<string, number>;
const DWELL_SECONDS = data.dwellSeconds as Record<string, number>;
/**
 * As stored: the departure minutes, where those trains usually finish, and the
 * ones that stop short of it.
 *
 * Most trains from a platform run to the same place, so the terminus is stored
 * once and only the exceptions are listed — 5% of departures, almost all of
 * them on the Circle Line, which runs a lot of partial services to Dhoby
 * Ghaut, Prince Edward Road and Stadium.
 */
interface StoredDepartures {
  t: number[];
  to: string | null;
  ex?: [number, string][];
}

// Through unknown: TypeScript widens the tuples in `ex` to (string | number)[]
// when it infers the JSON, which no amount of narrowing here will reconcile.
const DEPARTURES = data.departures as unknown as Record<
  string,
  Partial<Record<string, StoredDepartures>>
>;

/**
 * The departures that actually serve this leg.
 *
 * A short working is a real train at a real time that simply cannot take you:
 * timing a Circle Line journey against a service terminating at Dhoby Ghaut
 * gave a commuter a departure they would have had to get off early. Falls back
 * to the unfiltered list rather than claiming no trains run, which would be a
 * worse answer than a rough one.
 */
function servingTimes(entry: StoredDepartures, alightAt: string, direction: "asc" | "desc") {
  const exceptions = new Map(entry.ex ?? []);
  const kept = entry.t.filter((_, i) => {
    const end = exceptions.get(i) ?? entry.to;
    return end === null || end === undefined ? true : reachesAlong(end, alightAt, direction);
  });
  return kept.length > 0 ? kept : entry.t;
}

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
  /** Exact run times and dwells, for just the stations this route touches. */
  hopSeconds: Record<string, number>;
  dwellSeconds: Record<string, number>;
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
  const hopSeconds: Record<string, number> = {};
  const dwellSeconds: Record<string, number> = {};
  for (const leg of legs) {
    for (let i = 1; i < leg.path.length; i++) {
      const a = leg.path[i - 1];
      const b = leg.path[i];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (HOPS[key] !== undefined) hops[key] = HOPS[key];
      if (HOP_SECONDS[key] !== undefined) hopSeconds[key] = HOP_SECONDS[key];
      if (DWELL_SECONDS[b] !== undefined) dwellSeconds[b] = DWELL_SECONDS[b];
    }
  }

  // Only the boarding platforms, only today's timetable, and only the trains
  // that run far enough to be any use on this leg. Filtering here rather than
  // in the browser keeps the payload small and keeps journey-time.ts free of
  // the station data that working out reachability needs.
  const departures: DepartureTable = {};
  for (const leg of legs) {
    const key = `${leg.boardAt}|${leg.direction}`;
    const entry = DEPARTURES[key]?.[day];
    if (!entry) continue;
    const alightAt = leg.path[leg.path.length - 1];
    departures[key] = { [day]: servingTimes(entry, alightAt, leg.direction) };
  }

  // One transfer figure for the route: the walk at each interchange.
  const firstTransfer =
    routeLegs.length > 1
      ? transferTime(routeLegs[0].to.code, routeLegs[1].from.code)
      : transferTime("", "");

  return {
    legs,
    hops,
    hopSeconds,
    dwellSeconds,
    departures,
    day,
    transferWalkMinutes: firstTransfer.minutes,
    transferMeasured: firstTransfer.confidence === "measured",
  };
}

export { estimateJourneyExact };
