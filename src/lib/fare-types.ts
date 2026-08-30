/**
 * Types and pure helpers for fares.
 *
 * Deliberately separate from fare.ts, which imports the ~350 KB pair table.
 * Client components need to format a fare that the server already worked out;
 * importing a formatter from a module that also imports JSON drags the whole
 * dataset into the browser, which is invisible until someone loads the app on
 * mobile data. scripts/check-bundle.mjs fails the build if that happens.
 *
 * Same split, and the same reason, as feature-types.ts against positions.ts.
 */

/** Who is holding the card. Concession types flatten above 7.2 km. */
export const FARE_TYPES = ["adult", "student", "senior", "workfare", "disabilities"] as const;
export type FareType = (typeof FARE_TYPES)[number];

export const DEFAULT_FARE_TYPE: FareType = "adult";

/**
 * LTA reports distance in units of 10 m, and we store it exactly as given
 * rather than converting — integers compare against band edges without the
 * rounding a float kilometre would invite.
 */
export const UNITS_PER_KM = 100;

/** [fromKm, toKm, cents]; toKm is null on the open-ended top band. */
export type Band = [number, number | null, number];

export interface Fare {
  /** Cents, so no float ever touches money. */
  cents: number;
  /** The distance it was priced on, in units of 10 m. */
  units: number;
}

/**
 * The band a distance falls in, priced in cents.
 *
 * Bands read "up to 3.2 km", then "3.3 - 4.2 km". Between them sits a hair of
 * distance (3.21-3.29 km) that no band names, so this takes the first band
 * whose upper bound the distance does not exceed rather than testing both
 * ends. That is what "up to" means, and it is what LTA's own calculator does:
 * the import priced all 16,290 pairs this way and 16,282 matched exactly.
 *
 * Takes the table as an argument rather than importing it, so this stays free
 * of data and usable from either side of the network boundary.
 */
export function priceFromBands(
  units: number,
  bands: Band[],
): number {
  for (const [, toKm, cents] of bands) {
    if (toKm === null) return cents;
    if (units <= Math.round(toKm * UNITS_PER_KM)) return cents;
  }
  return bands[bands.length - 1][2];
}

/** "$1.79". Cents in, never a float. */
export function formatFare(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "13.3 km", at the one decimal LTA itself publishes. */
export function formatDistance(units: number): string {
  return `${(units / UNITS_PER_KM).toFixed(1)} km`;
}
