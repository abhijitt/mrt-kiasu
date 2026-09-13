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
 * - Promenade is where the Circle Line loop closes, CC34 running back into CC4.
 * - The LRT loops run out from and back to their interchange hub, so each loop's
 *   first and last station both touch the hub.
 * - The Bukit Panjang LRT is a stem (BP1-BP6) plus a loop around Bukit Panjang
 *   that closes at BP6.
 *   https://en.wikipedia.org/wiki/Bukit_Panjang_LRT_line
 */
const EXPLICIT_LINKS: [string, string][] = [
  ["EW4", "CG1"],
  // The Circle Line loop closes here: CC34 Bayfront runs into CC4 Promenade,
  // which consecutive numbering cannot express.
  ["CC4", "CC34"],
  ["STC", "SE1"], ["STC", "SE5"],
  ["STC", "SW1"], ["STC", "SW8"],
  ["PTC", "PE1"], ["PTC", "PE7"],
  ["PTC", "PW1"], ["PTC", "PW7"],
  ["BP6", "BP13"],
];

/**
 * The one edge where the numbers wrap.
 *
 * Stage 6 closed the Circle Line into a loop, so a train leaving CC34 Bayfront
 * arrives at CC4 Promenade and carries on — anticlockwise, the same way it was
 * already going. Comparing numbers says that hop descends, which would put the
 * commuter on the platform opposite the one they want. Listed from the end
 * where travel is still ascending.
 *
 * LTA's own first/last train data agrees: CC34's anticlockwise platform is the
 * one it calls ascending.
 */
const WRAP_EDGES: [string, string][] = [["CC34", "CC4"]];

/** "asc" or "desc" if this hop crosses the seam, null if it does not. */
function wrapDirection(from: string, to: string): "asc" | "desc" | null {
  for (const [a, b] of WRAP_EDGES) {
    if (from === a && to === b) return "asc";
    if (from === b && to === a) return "desc";
  }
  return null;
}

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
 * Where a code sits along its own line, as [prefix index, number].
 *
 * Comparing bare numbers is wrong wherever a line has more than one prefix.
 * CG1 to EW4 reads "1 to 4" and looks like it ascends, when it is actually
 * running back down the Changi branch toward Tanah Merah — and direction
 * decides which platform's timetable, features and door side get used, so
 * getting it backwards shows the commuter a train going the other way.
 */
export function positionOnLine(code: string): [number, number] {
  const { prefix, num } = splitCode(code);
  // Found by prefix rather than by looking the station up, because a code can
  // be real without being in our list. LTA's GTFS already runs trains to CC32,
  // which their station-code file has yet to mention — and looking that up
  // returned an index of -1, sorting it before every station on its own line.
  // reachesAlong then judged a train terminating there unable to reach stops
  // it passes through, and quietly dropped those departures.
  const line = Object.values(LINES).find((l) => l.prefixes.includes(prefix));
  return [line ? line.prefixes.indexOf(prefix) : -1, num ?? 0];
}

/** Travel direction from one code to another along their shared line. */
export function directionBetween(from: string, to: string): "asc" | "desc" {
  const wrapped = wrapDirection(from.toUpperCase(), to.toUpperCase());
  if (wrapped) return wrapped;
  const a = positionOnLine(from);
  const b = positionOnLine(to);
  if (a[0] !== b[0]) return b[0] > a[0] ? "asc" : "desc";
  return b[1] >= a[1] ? "asc" : "desc";
}

/**
 * Whether a train finishing at `terminus` gets you as far as `stop`.
 *
 * Short workings are real trains at real times that simply cannot take you:
 * the Circle Line runs a lot of partial services to Dhoby Ghaut, Prince Edward
 * Road and Stadium, and timing a journey against one hands a commuter a
 * departure they would have to get off early.
 */
export function reachesAlong(
  terminus: string,
  stop: string,
  direction: "asc" | "desc",
): boolean {
  const end = positionOnLine(terminus);
  const want = positionOnLine(stop);
  const delta = end[0] !== want[0] ? end[0] - want[0] : end[1] - want[1];
  return direction === "asc" ? delta >= 0 : delta <= 0;
}

/**
 * The platforms a surveyor can actually stand on at one station code.
 *
 * Labelled by the next stop rather than the terminus. The terminus looks like
 * the friendlier label and is what platform signage uses, but we cannot derive
 * it correctly: sorting a line's stations puts branch prefixes last, so the
 * Circle Line's ascending end came out as Marina Bay instead of
 * HarbourFront, and the East West Line's as Changi Airport (CG2) instead of
 * Tuas Link. LTA publishes real headsigns, and on the Circle Line they read
 * "Clockwise",
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

  // Branch prefixes sort after the main line, so position is the prefix's
  // place in that list first and the number within it second.
  const positionOf = positionOnLine;
  const here = positionOf(station.code);
  const isAfter = (p: [number, number]) =>
    p[0] !== here[0] ? p[0] > here[0] : p[1] > here[1];

  const samePrefix = splitCode(station.code).prefix;
  const out: PlatformDirection[] = [];

  // Which way you are travelling when you step onto the train to this
  // neighbour. The seam wins where there is one, because at Bayfront the next
  // stop anticlockwise is CC4, whose number is lower.
  const towardNeighbour = (next: string) =>
    wrapDirection(station.code, next) ?? (isAfter(positionOf(next)) ? "asc" : "desc");

  for (const direction of ["desc", "asc"] as const) {
    const candidates = (GRAPH.get(station.code) ?? [])
      .filter((e) => e.kind === "ride")
      .map((e) => STATIONS.find((s) => s.code === e.to))
      .filter((s): s is Station => Boolean(s) && s!.line === station.line)
      .filter((s) => towardNeighbour(s.code) === direction);

    if (candidates.length === 0) continue;
    // A junction can offer two ways onward — Tanah Merah has both EW5 and the
    // Changi branch, and Promenade has Dhoby Ghaut behind it as well as the
    // far side of the loop. Prefer the next number along, then the one sharing
    // this code's prefix: at CC4 that is CC3, which is what LTA calls the
    // descending platform there.
    const mine = splitCode(station.code).num;
    const best =
      candidates.find((s) => Math.abs((splitCode(s.code).num ?? 0) - (mine ?? 0)) === 1) ??
      candidates.find((s) => splitCode(s.code).prefix === samePrefix) ??
      candidates[0];
    out.push({ direction, nextStop: best });
  }

  return out;
}

export interface StationPlatform {
  /** The station code this platform belongs to — CC34 and DT16 are one station. */
  code: string;
  line: LineCode;
  direction: "asc" | "desc";
  /** Named by the next stop, for the same reason platformDirections is. */
  nextStop: Station;
}

/**
 * Every platform at one physical station, across all of its codes.
 *
 * platformDirections answers for a single code, which is what a station page
 * needs. A surveyor standing in Bayfront is standing in CC34 and DT16 at once,
 * and the four platforms under their feet are all worth recording while they
 * are there — so this walks the interchange links too.
 *
 * Ordered by code so the list does not reshuffle depending on which platform
 * you happen to be looking at.
 */
export function stationPlatforms(code: string): StationPlatform[] {
  const station = STATIONS.find((s) => s.code === code.toUpperCase());
  if (!station) return [];

  const codes = [station.code, ...station.interchanges.map((i) => i.code)].sort();
  const out: StationPlatform[] = [];
  for (const c of codes) {
    const at = STATIONS.find((s) => s.code === c);
    if (!at) continue;
    for (const p of platformDirections(c)) {
      out.push({ code: c, line: at.line, direction: p.direction, nextStop: p.nextStop });
    }
  }
  return out;
}
