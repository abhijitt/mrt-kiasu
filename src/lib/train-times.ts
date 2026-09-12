import "server-only";
import data from "@/data/train-times.json";
import { lineFromStationCode } from "./lines";
import type { TrainTime } from "./service-status";

/**
 * First and last train times, from LTA's GTFS Schedule (Train) feed.
 *
 * `server-only`: the file is ~200 KB and only ever needed for the station
 * being rendered, so the page passes down the few rows it uses rather than
 * shipping the timetable for the whole network to every browser.
 */

export type ServiceDay = "weekday" | "saturday" | "sunday";

// One definition, in the pure module. This one is about the data file; the
// shape of a timetable row belongs with the code that reasons about it.
export type { TrainTime } from "./service-status";

export type StationTimes = Partial<Record<ServiceDay, TrainTime[]>>;

/**
 * The destination a train boarded here will actually be displaying.
 *
 * A leg is described by where the commuter gets off, which is not what is
 * written on the front of the train: Admiralty to Ang Mo Kio is boarded on a
 * train that says Marina South Pier. This returns the operator's own word for
 * it, which is the only thing that matches the platform sign — and on the
 * Circle Line and the LRT loops it is a direction rather than a place
 * ("Clockwise", "Service B"), because that is genuinely what they display.
 *
 * Null where the feed has no headsign for that station and direction, which
 * includes the Punggol loops; callers fall back rather than guess.
 */
export function headsignFor(
  code: string,
  direction: "asc" | "desc",
  day: ServiceDay,
): string | null {
  const rows = stations[code.toUpperCase()]?.[day];
  return rows?.find((row) => row.direction === direction)?.towards ?? null;
}

const stations = data.stations as Record<string, StationTimes>;

/** Times for one station, or null when the feed does not cover it. */
export function timesForStation(code: string): StationTimes | null {
  const found = stations[code.toUpperCase()];
  if (!found) return null;

  const line = lineFromStationCode(code);
  if (!line) return found;

  const tagged: StationTimes = {};
  for (const [day, rows] of Object.entries(found) as [ServiceDay, TrainTime[]][]) {
    tagged[day] = rows.map((row) => ({ ...row, line }));
  }
  return tagged;
}

/**
 * Merged times for an interchange.
 *
 * A station like Bishan is NS17 and CC15, and a commuter standing there wants
 * both lines' timings rather than whichever code the page happens to use.
 */
export function timesForCodes(codes: readonly string[]): StationTimes | null {
  const merged: StationTimes = {};
  let found = false;

  for (const code of codes) {
    const times = timesForStation(code);
    if (!times) continue;
    found = true;
    for (const [day, rows] of Object.entries(times) as [ServiceDay, TrainTime[]][]) {
      const into = (merged[day] ??= []);
      for (const row of rows) {
        // The same direction can appear under two codes at an interchange.
        if (!into.some((r) => r.towards === row.towards)) into.push(row);
      }
    }
  }

  if (!found) return null;
  for (const rows of Object.values(merged)) {
    rows.sort((a, b) => a.towards.localeCompare(b.towards));
  }
  return merged;
}

/** Provenance, shown alongside the times rather than kept in a comment. */
export const TRAIN_TIMES_SOURCE = data._source;
