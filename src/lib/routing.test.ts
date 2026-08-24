import { describe, expect, it } from "vitest";
import { planRoute, planRouteBetweenStations } from "./routing";
import { GRAPH, neighbours } from "./network";
import { STATIONS, getStation } from "./stations";

/** Every station should be reachable from every other on a connected network. */
function reachableFrom(start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of neighbours(at)) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return seen;
}

describe("network graph", () => {
  it("includes every station", () => {
    expect(GRAPH.size).toBe(STATIONS.length);
  });

  it("is fully connected — no station is stranded", () => {
    const reached = reachableFrom("NS1");
    const missing = STATIONS.filter((s) => !reached.has(s.code)).map((s) => s.code);
    expect(missing).toEqual([]);
  });

  it("is symmetric — every edge goes both ways", () => {
    for (const [from, edges] of GRAPH) {
      for (const e of edges) {
        const back = neighbours(e.to).find((x) => x.to === from);
        expect(back, `${e.to} -> ${from} missing`).toBeDefined();
      }
    }
  });

  it("skips reserved code gaps rather than linking through them", () => {
    // NE2 does not exist, so NE1 connects straight to NE3.
    expect(neighbours("NE1").map((e) => e.to)).toContain("NE3");
    expect(getStation("NE2")).toBeNull();
  });

  it("connects the Changi Airport branch at Tanah Merah", () => {
    expect(neighbours("EW4").map((e) => e.to)).toContain("CG1");
    expect(neighbours("CG1").map((e) => e.to)).toContain("CG2");
  });

  it("closes the Bukit Panjang LRT loop at Bukit Panjang, not Choa Chu Kang", () => {
    expect(neighbours("BP6").map((e) => e.to)).toContain("BP13");
    expect(neighbours("BP1").map((e) => e.to)).not.toContain("BP13");
  });

  it("connects both ends of each LRT loop to its hub", () => {
    const stc = neighbours("STC").map((e) => e.to);
    expect(stc).toEqual(expect.arrayContaining(["SE1", "SE5", "SW1", "SW8"]));
    const ptc = neighbours("PTC").map((e) => e.to);
    expect(ptc).toEqual(expect.arrayContaining(["PE1", "PE7", "PW1", "PW7"]));
  });
});

describe("planRoute", () => {
  it("plans a direct journey with no interchange", () => {
    // Both on the North East Line.
    const route = planRoute("NE1", "NE12")!;
    expect(route).not.toBeNull();
    expect(route.interchangeCount).toBe(0);
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0].line).toBe("NEL");
    expect(route.legs[0].direction).toBe("asc");
  });

  it("gets the direction right travelling the other way", () => {
    const route = planRoute("NE12", "NE1")!;
    expect(route.legs[0].direction).toBe("desc");
  });

  it("finds the interchange for a two-line journey", () => {
    // Dhoby Ghaut is the NSL/NEL/CCL interchange.
    const route = planRoute("NE1", "NS1")!;
    expect(route.interchangeCount).toBeGreaterThanOrEqual(1);
    const changeNames = route.legs.slice(0, -1).map((l) => l.to.name);
    expect(changeNames.length).toBe(route.interchangeCount);
  });

  it("routes to Changi Airport via the branch", () => {
    const route = planRoute("NS1", "CG2")!;
    expect(route).not.toBeNull();
    const last = route.legs[route.legs.length - 1];
    expect(last.to.code).toBe("CG2");
    // The branch is only reachable through Tanah Merah.
    expect(route.path).toContain("EW4");
  });

  it("returns null for an unknown station rather than throwing", () => {
    expect(planRoute("NE1", "ZZ99")).toBeNull();
    expect(planRoute("QQ1", "NE1")).toBeNull();
  });

  it("returns null when origin and destination are the same", () => {
    expect(planRoute("NE1", "NE1")).toBeNull();
  });

  it("counts stops consistently with the legs", () => {
    const route = planRoute("EW1", "EW20")!;
    const fromLegs = route.legs.reduce((n, l) => n + l.stops.length + 1, 0);
    expect(route.stopCount).toBe(fromLegs);
  });

  it("prefers staying on one line over an equal-length change", () => {
    // NE1 to NE6 is direct; any route via an interchange would be worse.
    const route = planRoute("NE1", "NE6")!;
    expect(route.interchangeCount).toBe(0);
  });

  it("plans a route between every pair of terminals without failing", () => {
    const terminals = ["NS1", "EW1", "EW33", "NE1", "NE18", "CC1", "DT1", "DT35", "TE1", "TE29"];
    for (const a of terminals) {
      for (const b of terminals) {
        if (a === b) continue;
        const route = planRoute(a, b);
        expect(route, `${a} -> ${b}`).not.toBeNull();
        expect(route!.legs.length).toBeGreaterThan(0);
      }
    }
  });

  it("never emits a leg whose ends are the same station", () => {
    const route = planRoute("BP13", "CG2")!;
    for (const leg of route.legs) {
      expect(leg.from.code).not.toBe(leg.to.code);
    }
  });
});

describe("planRouteBetweenStations", () => {
  it("does not open a route with a pointless transfer at the origin", () => {
    // Serangoon is NE12 and CC13; starting there should just board a train.
    const route = planRouteBetweenStations("Serangoon", "Jurong East")!;
    expect(route).not.toBeNull();
    expect(route.legs[0].from.name).toBe("Serangoon");
  });

  it("picks the better platform pair at both ends", () => {
    const route = planRouteBetweenStations("HarbourFront", "Expo")!;
    expect(route.legs[0].from.name).toBe("HarbourFront");
    expect(route.legs[route.legs.length - 1].to.name).toBe("Expo");
  });

  it("returns null for the same station or an unknown name", () => {
    expect(planRouteBetweenStations("Serangoon", "Serangoon")).toBeNull();
    expect(planRouteBetweenStations("Serangoon", "Atlantis")).toBeNull();
  });
});
