/**
 * Station reference data for the whole network.
 *
 * Built by scripts/import_stations.py from LTA's official station code file,
 * Wikidata/Wikipedia opening dates, and LTA's exit dataset. Nothing here is
 * hand-typed, so a re-import picks up new stations automatically.
 */

import stationsData from "@/data/stations.json";
import { LINES, lineFromStationCode, type LineCode } from "./lines";

export interface Exit {
  code: string;
  lat: number;
  lng: number;
}

export interface Interchange {
  code: string;
  line: string;
}

export interface Station {
  code: string;
  name: string;
  nameZh: string;
  line: LineCode;
  lineName: string;
  /** ISO date the station first opened. Null if no source had it. */
  opened: string | null;
  interchanges: Interchange[];
  exits: Exit[];
  center: { lat: number; lng: number } | null;
  dataGaps: string[];
}

interface RawStation {
  code: string;
  name: string;
  nameZh: string;
  line: string;
  lineName: string;
  opened: string | null;
  interchanges: Interchange[];
  exits: Exit[];
  dataGaps: string[];
}

function build(raw: RawStation): Station {
  const line = lineFromStationCode(raw.code);
  if (!line) {
    throw new Error(`Station ${raw.code} has no known line — refusing to guess.`);
  }

  const center =
    raw.exits.length > 0
      ? {
          lat: raw.exits.reduce((sum, e) => sum + e.lat, 0) / raw.exits.length,
          lng: raw.exits.reduce((sum, e) => sum + e.lng, 0) / raw.exits.length,
        }
      : null;

  return { ...raw, line, center };
}

export const STATIONS: Station[] = (stationsData.stations as RawStation[]).map(build);

const byCode = new Map(STATIONS.map((s) => [s.code.toUpperCase(), s]));

export function getStation(code: string): Station | null {
  return byCode.get(code.toUpperCase()) ?? null;
}

/** Numeric part of a station code; 0 for hub codes like STC. */
export function stationNumber(code: string): number {
  const digits = code.replace(/^\D+/, "");
  return digits === "" ? 0 : Number(digits);
}

export function stationsOnLine(line: LineCode): Station[] {
  const prefixes = LINES[line].prefixes;
  return STATIONS.filter((s) => s.line === line).sort((a, b) => {
    const pa = prefixes.indexOf(a.code.replace(/\d+$/, ""));
    const pb = prefixes.indexOf(b.code.replace(/\d+$/, ""));
    return pa !== pb ? pa - pb : stationNumber(a.code) - stationNumber(b.code);
  });
}

/**
 * One entry per physical station, merging interchange codes.
 * Used wherever a person picks a place rather than a platform.
 */
export interface StationGroup {
  name: string;
  nameZh: string;
  codes: string[];
  lines: LineCode[];
  /** Canonical code to route from. */
  primaryCode: string;
  exits: Exit[];
}

export const STATION_GROUPS: StationGroup[] = (() => {
  const groups = new Map<string, StationGroup>();
  for (const s of STATIONS) {
    const k = s.name.toLowerCase();
    if (!groups.has(k)) {
      groups.set(k, {
        name: s.name,
        nameZh: s.nameZh,
        codes: [],
        lines: [],
        primaryCode: s.code,
        exits: s.exits,
      });
    }
    const g = groups.get(k)!;
    g.codes.push(s.code);
    if (!g.lines.includes(s.line)) g.lines.push(s.line);
    if (s.exits.length > g.exits.length) g.exits = s.exits;
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

export function getGroup(name: string): StationGroup | null {
  return STATION_GROUPS.find((g) => g.name.toLowerCase() === name.toLowerCase()) ?? null;
}
