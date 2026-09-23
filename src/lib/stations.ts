/**
 * Station reference data for the whole network.
 *
 * Built by scripts/import_stations.py from LTA's official station code file,
 * Wikidata/Wikipedia opening dates, and LTA's exit dataset. Nothing here is
 * hand-typed, so a re-import picks up new stations automatically.
 */

import stationsData from "@/data/stations.json";
import { LINES, lineFromStationCode, type LineCode } from "./lines";
import { stationSlug } from "./station-slug";

export interface Exit {
  code: string;
  lat: number;
  lng: number;
  /** Set only where the exit came from outside LTA's dataset — see exits.json. */
  source?: string;
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
  /** Only where LTA's exit dataset has no entry yet — see stations.json. */
  coord?: { lat: number; lng: number };
}

function build(raw: RawStation): Station {
  const line = lineFromStationCode(raw.code);
  if (!line) {
    throw new Error(`Station ${raw.code} has no known line — refusing to guess.`);
  }

  // A station that opened after LTA last published its exit dataset has no
  // exits to average, and carries the GTFS stop coordinate instead.
  const center =
    raw.exits.length > 0
      ? {
          lat: raw.exits.reduce((sum, e) => sum + e.lat, 0) / raw.exits.length,
          lng: raw.exits.reduce((sum, e) => sum + e.lng, 0) / raw.exits.length,
        }
      : (raw.coord ?? null);

  return { ...raw, line, center };
}

export const STATIONS: Station[] = (stationsData.stations as RawStation[]).map(build);

const byCode = new Map(STATIONS.map((s) => [s.code.toUpperCase(), s]));

/**
 * Codes that have been retired, pointing at what replaced them.
 *
 * Stage 6 closed the Circle Line loop and renumbered its extension, so links
 * shared before then — and anything anyone bookmarked — still name CE1 and
 * CE2. They describe real platforms that still exist, so they resolve rather
 * than 404. The station page redirects to the current code.
 */
export const RETIRED_CODES: Record<string, string> = {
  CE1: "CC34",
  CE2: "CC33",
};

export function getStation(code: string): Station | null {
  const upper = code.toUpperCase();
  return byCode.get(upper) ?? byCode.get(RETIRED_CODES[upper] ?? "") ?? null;
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
 * The end of the line a direction heads for: "desc" towards the lowest code,
 * "asc" towards the highest. DTL "desc" is Bukit Panjang, "asc" is Expo —
 * the names on the platform signs, which is what a person matches against.
 */
export function terminusOf(line: string, direction: "asc" | "desc"): string | null {
  // Interchanges name LRT lines too, which have no entry here.
  if (!(line in LINES)) return null;
  const on = stationsOnLine(line as LineCode);
  if (on.length === 0) return null;
  return (direction === "desc" ? on[0] : on[on.length - 1]).name;
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

/**
 * Finds a station by name or by URL slug.
 *
 * Both, because route URLs used to carry the raw name ("Paya%20Lebar") and
 * those links are in people's history and in chat threads. A slug is the
 * canonical form now; the name still resolves so nothing that already works
 * stops working.
 */
export function getGroup(name: string): StationGroup | null {
  const wanted = name.toLowerCase();
  const bySlug = stationSlug(name);
  return (
    STATION_GROUPS.find((g) => g.name.toLowerCase() === wanted) ??
    STATION_GROUPS.find((g) => stationSlug(g.name) === bySlug) ??
    null
  );
}
