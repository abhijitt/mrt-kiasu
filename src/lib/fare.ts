/**
 * What a journey costs.
 *
 * Two sourced pieces, deliberately kept apart:
 *
 *   fare-distances.json  LTA's own distance for every pair of stations, from
 *                        their fare calculator.
 *   fare-bands.json      The PTC's distance-to-price table.
 *
 * Distance is track geometry and never moves; the PTC revises prices roughly
 * yearly. Splitting them means a fare revision replaces one small file and
 * touches no code.
 *
 * Every pair is stored outright rather than summed from adjacent hops. Summing
 * looks equivalent and is not: LTA rounds each hop to 0.1 km, so a ten-hop
 * journey carries ten roundings against their once-rounded figure. Measured
 * over 100 journeys that drifted up to 700 m and priced 7 of them into the
 * wrong band.
 *
 * Fares are charged on the distance between the two stations, not on the route
 * ridden — someone who goes the long way round for a seat pays the same. A
 * flat lookup is therefore the whole calculation.
 */

import distanceData from "@/data/fare-distances.json";
import bandData from "@/data/fare-bands.json";
import { STATIONS } from "./stations";
import {
  priceFromBands,
  DEFAULT_FARE_TYPE,
  type Band,
  type Fare,
  type FareType,
} from "./fare-types";

// Re-exported so callers that already hold the data can take everything from
// one module; anything in a client component must import from fare-types
// directly, or the datasets below follow it into the browser bundle.
export type { Band, Fare, FareType } from "./fare-types";
export {
  FARE_TYPES,
  DEFAULT_FARE_TYPE,
  UNITS_PER_KM,
  formatFare,
  formatDistance,
  priceFromBands,
} from "./fare-types";

const BANDS = bandData.bands as Record<FareType, Band[]>;
const PAIRS = distanceData.pairs as Record<string, number>;

/**
 * Codes that name the same physical station, collapsed to one.
 *
 * Marina Bay is NS27, CE2 and TE20; you are charged for one station, not
 * three, so the fare table is keyed by station rather than by code. Grouping
 * follows the interchange links already in stations.json and names each group
 * by its first code alphabetically, matching what the importer wrote.
 */
function buildCanonical(): Map<string, string> {
  const known = new Set(STATIONS.map((s) => s.code));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const s of STATIONS) {
    find(s.code);
    for (const i of s.interchanges) if (known.has(i.code)) union(s.code, i.code);
  }

  const groups = new Map<string, string[]>();
  for (const s of STATIONS) {
    const root = find(s.code);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(s.code);
  }

  const canonical = new Map<string, string>();
  for (const codes of groups.values()) {
    const name = [...codes].sort()[0];
    for (const c of codes) canonical.set(c, name);
  }
  return canonical;
}

const CANONICAL = buildCanonical();

/** The station a code belongs to, however the caller spells it. */
export function stationOf(code: string): string | null {
  return CANONICAL.get(code.toUpperCase()) ?? null;
}

/**
 * Distance between two stations in units of 10 m, as LTA measures it.
 *
 * Null when we have no figure — an unknown code, or a pair the import has yet
 * to reach. A caller should show no fare rather than a wrong one.
 */
export function distanceBetween(fromCode: string, toCode: string): number | null {
  const from = stationOf(fromCode);
  const to = stationOf(toCode);
  if (!from || !to) return null;
  if (from === to) return 0;
  return PAIRS[[from, to].sort().join("|")] ?? null;
}

/**
 * The band a distance falls in, priced in cents.
 *
 * Bands read "up to 3.2 km", then "3.3 - 4.2 km". Between them sits a hair of
 * distance (3.21-3.29 km) that no band names, so this takes the first band
 * whose upper bound the distance does not exceed rather than testing both
 * ends. That is what "up to" means, and it is what LTA's own calculator does:
 * the import prices every pair as it arrives and reports any disagreement.
 */
export function fareForDistance(units: number, type: FareType = DEFAULT_FARE_TYPE): number {
  return priceFromBands(units, BANDS[type]);
}

/** The fare between two stations, or null when we cannot measure the journey. */
export function fareBetween(
  fromCode: string,
  toCode: string,
  type: FareType = DEFAULT_FARE_TYPE,
): Fare | null {
  const units = distanceBetween(fromCode, toCode);
  if (units === null) return null;
  return { cents: fareForDistance(units, type), units };
}

