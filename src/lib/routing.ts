/**
 * Journey planning across the rail network.
 *
 * Dijkstra over the derived graph, with a penalty on interchanges so a route
 * with fewer changes wins unless a change genuinely saves time. That matches
 * how people actually choose: a slightly longer ride usually beats hauling
 * across an interchange.
 */

import { GRAPH, RIDE_MINUTES, TRANSFER_MINUTES, splitCode } from "./network";
import { getGroup, getStation, type Station } from "./stations";
import { lineFromStationCode, LINES, type LineCode } from "./lines";
import type { Direction } from "./doors";

export interface RouteLeg {
  line: LineCode;
  /** Station where this leg is boarded. */
  from: Station;
  /** Station where this leg is left. */
  to: Station;
  /** Intermediate stations, excluding both ends. */
  stops: Station[];
  /** Travel direction along the line's code numbering. */
  direction: Direction;
  /** Terminus-ward description, e.g. "towards Punggol". */
  towards: string;
}

export interface Route {
  legs: RouteLeg[];
  /** Total stations passed through, excluding the origin. */
  stopCount: number;
  interchangeCount: number;
  /** Approximate minutes. Ranking aid, not a published timetable figure. */
  approxMinutes: number;
  path: string[];
}

/** Minimal binary heap — the graph is small but this keeps routing snappy. */
class Heap {
  private items: { code: string; cost: number }[] = [];

  push(code: string, cost: number): void {
    this.items.push({ code, cost });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].cost <= this.items[i].cost) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): { code: string; cost: number } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.items.length && this.items[l].cost < this.items[best].cost) best = l;
        if (r < this.items.length && this.items[r].cost < this.items[best].cost) best = r;
        if (best === i) break;
        [this.items[best], this.items[i]] = [this.items[i], this.items[best]];
        i = best;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

function shortestPath(from: string, to: string): string[] | null {
  const start = from.toUpperCase();
  const goal = to.toUpperCase();
  if (!GRAPH.has(start) || !GRAPH.has(goal)) return null;
  if (start === goal) return [start];

  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, string>();
  const settled = new Set<string>();
  const heap = new Heap();
  heap.push(start, 0);

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (settled.has(current.code)) continue;
    settled.add(current.code);
    if (current.code === goal) break;

    for (const edge of GRAPH.get(current.code) ?? []) {
      const next = current.cost + edge.cost;
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next);
        prev.set(edge.to, current.code);
        heap.push(edge.to, next);
      }
    }
  }

  if (!dist.has(goal)) return null;

  const path: string[] = [];
  for (let at: string | undefined = goal; at; at = prev.get(at)) {
    path.push(at);
    if (at === start) break;
  }
  return path.reverse();
}

/**
 * Splits a path into legs, one per train the commuter actually boards.
 *
 * A leg break happens at a transfer edge — a change of station code at the same
 * physical station. Staying on the same line through an interchange is not a
 * leg break, which is why this walks the path rather than grouping by line.
 */
function toLegs(path: string[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  let legStart = 0;

  for (let i = 0; i < path.length; i++) {
    const isLast = i === path.length - 1;
    // A transfer is two consecutive codes naming the same physical station.
    const transferHere =
      !isLast &&
      getStation(path[i])?.name === getStation(path[i + 1])?.name &&
      path[i] !== path[i + 1];

    if (transferHere || isLast) {
      const codes = path.slice(legStart, i + 1);
      if (codes.length >= 2) {
        const from = getStation(codes[0])!;
        const to = getStation(codes[codes.length - 1])!;
        const line = lineFromStationCode(codes[0])!;
        const firstNum = splitCode(codes[0]).num ?? 0;
        const lastNum = splitCode(codes[codes.length - 1]).num ?? 0;
        legs.push({
          line,
          from,
          to,
          stops: codes.slice(1, -1).map((c) => getStation(c)!),
          direction: lastNum >= firstNum ? "asc" : "desc",
          towards: to.name,
        });
      }
      legStart = i + 1;
    }
  }

  return legs;
}

export function planRoute(from: string, to: string): Route | null {
  const path = shortestPath(from, to);
  if (!path || path.length < 2) return null;

  const legs = toLegs(path);
  if (legs.length === 0) return null;

  const rideEdges = legs.reduce((n, leg) => n + leg.stops.length + 1, 0);
  const interchangeCount = legs.length - 1;

  return {
    legs,
    stopCount: rideEdges,
    interchangeCount,
    approxMinutes: Math.round(
      rideEdges * RIDE_MINUTES + interchangeCount * TRANSFER_MINUTES,
    ),
    path,
  };
}

/**
 * Plans between two physical stations rather than two platforms.
 *
 * An interchange has several codes for one building, and which one a commuter
 * "starts at" is meaningless — they just walk in. Trying every code pair and
 * keeping the best avoids routes that open with a pointless transfer.
 */
export function planRouteBetweenStations(
  fromName: string,
  toName: string,
): Route | null {
  const from = getGroup(fromName);
  const to = getGroup(toName);
  if (!from || !to || from.name === to.name) return null;

  let best: Route | null = null;
  for (const a of from.codes) {
    for (const b of to.codes) {
      const route = planRoute(a, b);
      if (route && (!best || route.approxMinutes < best.approxMinutes)) {
        best = route;
      }
    }
  }
  return best;
}

/** Where a leg's train is heading, for matching against platform signage. */
export function terminusLabel(leg: RouteLeg): string {
  const line = LINES[leg.line];
  return `${line.shortName} towards ${leg.towards}`;
}
