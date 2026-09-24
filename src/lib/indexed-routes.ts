import "server-only";
import volumesData from "@/data/volumes.json";
import { STATION_GROUPS, canonicalCode, getStation } from "./stations";
import { stationSlug } from "./station-slug";

/**
 * The route pages worth listing in search, out of the 33,672 there are.
 *
 * Most route pages should not be listed. Measured on the live site, every
 * route into Bugis is 83–92% the same page — the unique content is the
 * destination's exits and landmarks, which /station/EW12 already carries —
 * so 183 of them would compete with each other and with the station page for
 * one question. Those are noindex. This is the short list that is not: pairs
 * people plausibly type in as "Jurong East to Raffles Place", where the
 * route itself — the legs, the time, the fare, the door — is the answer.
 *
 * Chosen from LTA's tap counts rather than guessed. A pair scores the
 * origin's weekday tap-ins times the destination's tap-outs: the textbook
 * gravity estimate of how many make that trip, and the best stand-in for
 * search demand available without search data.
 *
 * It misses one group by construction. Taps measure how people travel, and a
 * commuter never searches the route they take every day; someone landing at
 * Changi does, and the airport's modest tap count ranks it nowhere. So it is
 * added on its own terms: to and from the busiest destinations.
 */

const BY_DEMAND = 300;
const AIRPORT = "Changi Airport";
const AIRPORT_DESTINATIONS = 25;

interface Pair {
  from: string;
  to: string;
}

const volumes = volumesData.stations as Record<
  string,
  { weekday: { in: number; out: number } }
>;

/** Weekday figures for a physical station, or null where LTA published none. */
function weekday(groupPrimaryCode: string) {
  const station = getStation(groupPrimaryCode);
  return station ? (volumes[canonicalCode(station)]?.weekday ?? null) : null;
}

const pairs: Pair[] = (() => {
  const stations = STATION_GROUPS.map((g) => ({ name: g.name, v: weekday(g.primaryCode) })).filter(
    (s): s is { name: string; v: { in: number; out: number } } => s.v !== null,
  );

  const ranked = stations
    .flatMap((a) =>
      stations
        .filter((b) => b !== a)
        .map((b) => ({ from: a.name, to: b.name, score: a.v.in * b.v.out })),
    )
    .sort((x, y) => y.score - x.score || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));

  const chosen = ranked.slice(0, BY_DEMAND).map(({ from, to }) => ({ from, to }));

  const busiest = [...stations]
    .filter((s) => s.name !== AIRPORT)
    .sort((a, b) => b.v.out - a.v.out || a.name.localeCompare(b.name))
    .slice(0, AIRPORT_DESTINATIONS);
  if (stations.some((s) => s.name === AIRPORT)) {
    for (const s of busiest) {
      chosen.push({ from: AIRPORT, to: s.name }, { from: s.name, to: AIRPORT });
    }
  }

  const seen = new Set<string>();
  return chosen.filter((p) => {
    const key = `${p.from}|${p.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
})();

const indexed = new Set(pairs.map((p) => `${stationSlug(p.from)}/${stationSlug(p.to)}`));

/** The routes to list in the sitemap, with the station names they join. */
export function indexedRoutes(): { path: string; from: string; to: string }[] {
  return pairs.map((p) => ({
    path: `/route/${stationSlug(p.from)}/${stationSlug(p.to)}`,
    from: p.from,
    to: p.to,
  }));
}

/** Whether a route page, by its station names, is one to list in search. */
export function isIndexedRoute(fromName: string, toName: string): boolean {
  return indexed.has(`${stationSlug(fromName)}/${stationSlug(toName)}`);
}
