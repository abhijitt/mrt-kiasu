/**
 * The rail network as a graph, built from the station dataset.
 *
 * Adjacency is DERIVED from official station codes rather than hand-listed:
 * within a code prefix (NS, EW, CC…) consecutive numbers are consecutive
 * stations, and reserved gaps (NE2, NS6, CC18, TE10, TE21) are simply skipped.
 *
 * Only the junctions that codes cannot express are stated explicitly, and each
 * is a verified physical connection rather than an assumption.
 */

import { STATIONS, type Station } from "./stations";
import { LINES, type LineCode } from "./lines";

/**
 * Track connections between different code sequences.
 *
 * - Tanah Merah is where the Changi Airport branch leaves the East West Line.
 * - Promenade is where the Circle Line Extension leaves the Circle Line.
 * - The LRT loops run out from and back to their interchange hub, so each loop's
 *   first and last station both touch the hub.
 * - The Bukit Panjang LRT is a stem (BP1-BP6) plus a loop around Bukit Panjang
 *   that closes at BP6.
 *   https://en.wikipedia.org/wiki/Bukit_Panjang_LRT_line
 */
const EXPLICIT_LINKS: [string, string][] = [
  ["EW4", "CG1"],
  ["CC4", "CE1"],
  ["STC", "SE1"], ["STC", "SE5"],
  ["STC", "SW1"], ["STC", "SW8"],
  ["PTC", "PE1"], ["PTC", "PE7"],
  ["PTC", "PW1"], ["PTC", "PW7"],
  ["BP6", "BP13"],
];

export type EdgeKind = "ride" | "transfer";

export interface Edge {
  to: string;
  kind: EdgeKind;
  /** Cost in approximate minutes. */
  cost: number;
}

/**
 * Typical dwell-plus-run time between adjacent stations, and the time lost
 * changing platforms. Both are approximations used to RANK routes; the UI
 * reports stops and interchanges as the concrete figures and labels any
 * duration as approximate. LTA does not publish inter-station run times.
 */
export const RIDE_MINUTES = 2.2;
export const TRANSFER_MINUTES = 5;

function splitCode(code: string): { prefix: string; num: number | null } {
  const m = code.toUpperCase().match(/^([A-Z]+)(\d*)$/);
  if (!m) return { prefix: code.toUpperCase(), num: null };
  return { prefix: m[1], num: m[2] === "" ? null : Number(m[2]) };
}

function buildGraph(): Map<string, Edge[]> {
  const graph = new Map<string, Edge[]>();
  const add = (from: string, to: string, kind: EdgeKind, cost: number) => {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push({ to, kind, cost });
  };
  const link = (a: string, b: string, kind: EdgeKind, cost: number) => {
    add(a, b, kind, cost);
    add(b, a, kind, cost);
  };

  const byCode = new Map(STATIONS.map((s) => [s.code, s]));

  // 1. Consecutive codes within a prefix are consecutive stations.
  const byPrefix = new Map<string, Station[]>();
  for (const s of STATIONS) {
    const { prefix } = splitCode(s.code);
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix)!.push(s);
  }
  for (const group of byPrefix.values()) {
    const ordered = group
      .map((s) => ({ s, num: splitCode(s.code).num }))
      .filter((x) => x.num !== null)
      .sort((a, b) => a.num! - b.num!);
    for (let i = 0; i + 1 < ordered.length; i++) {
      link(ordered[i].s.code, ordered[i + 1].s.code, "ride", RIDE_MINUTES);
    }
  }

  // 2. Junctions that codes cannot express.
  for (const [a, b] of EXPLICIT_LINKS) {
    if (byCode.has(a) && byCode.has(b)) link(a, b, "ride", RIDE_MINUTES);
  }

  // 3. Interchanges: the same physical station under several codes.
  for (const s of STATIONS) {
    for (const i of s.interchanges) {
      if (byCode.has(i.code)) add(s.code, i.code, "transfer", TRANSFER_MINUTES);
    }
  }

  return graph;
}

export const GRAPH = buildGraph();

export function neighbours(code: string): Edge[] {
  return GRAPH.get(code.toUpperCase()) ?? [];
}

export function lineOf(code: string): LineCode | null {
  const { prefix } = splitCode(code);
  const entry = Object.values(LINES).find((l) => l.prefixes.includes(prefix));
  return entry?.code ?? null;
}

export { splitCode };

/**
 * The platforms a surveyor can actually stand on at one station code.
 *
 * Labelled by the next stop rather than the terminus. The terminus looks like
 * the friendlier label and is what platform signage uses, but we cannot derive
 * it correctly: sorting a line's stations puts branch prefixes last, so the
 * Circle Line's ascending end came out as Marina Bay (CE2) instead of
 * HarbourFront, and the East West Line's as Changi Airport (CG2) instead of
 * Tuas Link. LTA publishes real headsigns, but not for every platform — CE1
 * and CE2 have none at all — and on the Circle Line they read "Clockwise",
 * which no derivation can produce. The next stop is always known, always
 * right, and just as easy to check against the strip map on the wall.
 *
 * A terminus platform has one direction, not two, so it yields a single entry.
 */
export interface PlatformDirection {
  direction: "asc" | "desc";
  /** The next station this platform's trains call at. */
  nextStop: Station;
}

export function platformDirections(code: string): PlatformDirection[] {
  const station = STATIONS.find((s) => s.code === code.toUpperCase());
  if (!station) return [];

  const prefixes = LINES[station.line].prefixes;
  // Branch prefixes sort after the main line, so position is the prefix's
  // place in that list first and the number within it second.
  const positionOf = (c: string): [number, number] => {
    const { prefix, num } = splitCode(c);
    return [prefixes.indexOf(prefix), num ?? 0];
  };
  const here = positionOf(station.code);
  const isAfter = (p: [number, number]) =>
    p[0] !== here[0] ? p[0] > here[0] : p[1] > here[1];

  const samePrefix = splitCode(station.code).prefix;
  const out: PlatformDirection[] = [];

  for (const direction of ["desc", "asc"] as const) {
    const candidates = (GRAPH.get(station.code) ?? [])
      .filter((e) => e.kind === "ride")
      .map((e) => STATIONS.find((s) => s.code === e.to))
      .filter((s): s is Station => Boolean(s) && s!.line === station.line)
      .filter((s) => (direction === "asc" ? isAfter(positionOf(s.code)) : !isAfter(positionOf(s.code))));

    if (candidates.length === 0) continue;
    // A junction can offer two ways onward — Tanah Merah has both EW5 and the
    // Changi branch. The main line is the one that shares this code's prefix.
    const best =
      candidates.find((s) => splitCode(s.code).prefix === samePrefix) ?? candidates[0];
    out.push({ direction, nextStop: best });
  }

  return out;
}
