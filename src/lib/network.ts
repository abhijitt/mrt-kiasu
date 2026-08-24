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
