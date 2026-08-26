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
