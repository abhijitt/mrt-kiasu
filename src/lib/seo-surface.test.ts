import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { STATIONS, STATION_GROUPS, canonicalCode, getGroup, getStation } from "@/lib/stations";

// Two of these modules are server-only; stub the guard so they import under test.
vi.mock("server-only", () => ({}));

const { indexedRoutes, isIndexedRoute } = await import("@/lib/indexed-routes");
const { newestOf, stationModified } = await import("@/lib/last-modified");
const { proxy } = await import("@/proxy");

describe("one listed page per interchange", () => {
  it("has every code at a station name the same canonical", () => {
    for (const s of STATIONS) {
      const others = s.interchanges.map((i) => getStation(i.code)!).filter(Boolean);
      for (const o of others) expect(canonicalCode(o), `${s.code} vs ${o.code}`).toBe(canonicalCode(s));
    }
  });

  it("never makes an LRT page the face of a station an MRT line serves", () => {
    expect(canonicalCode(getStation("BP6")!)).toBe("DT1");
    expect(canonicalCode(getStation("BP1")!)).toBe("NS4");
  });

  it("leads with the line people name the station by", () => {
    expect(canonicalCode(getStation("CC9")!)).toBe("EW8");
    expect(canonicalCode(getStation("CC1")!)).toBe("NS24");
  });

  it("leaves one canonical per physical station", () => {
    const canonical = new Set(STATIONS.map(canonicalCode));
    expect(canonical.size).toBe(STATION_GROUPS.length);
  });
});

describe("the route pages worth listing", () => {
  const routes = indexedRoutes();

  it("is a few hundred, not 33,672", () => {
    expect(routes.length).toBeGreaterThan(300);
    expect(routes.length).toBeLessThan(400);
    expect(new Set(routes.map((r) => r.path)).size).toBe(routes.length);
  });

  it("names only stations that resolve, and never a station to itself", () => {
    for (const r of routes) {
      expect(getGroup(r.from), r.from).not.toBeNull();
      expect(getGroup(r.to), r.to).not.toBeNull();
      expect(r.from).not.toBe(r.to);
    }
  });

  it("includes the airport, which tap counts alone would miss", () => {
    expect(isIndexedRoute("Changi Airport", "Orchard") || isIndexedRoute("Changi Airport", "Raffles Place")).toBe(true);
    expect(routes.some((r) => r.to === "Changi Airport")).toBe(true);
  });

  it("recognises a listed pair however its names are written", () => {
    const [first] = routes;
    expect(isIndexedRoute(first.from.toUpperCase(), first.to.toLowerCase())).toBe(true);
  });
});

describe("sitemap dates", () => {
  it("dates every station, as a whole calendar day", () => {
    for (const s of STATIONS) {
      const d = stationModified(s.code);
      expect(d, s.code).toBeInstanceOf(Date);
      expect(d!.toISOString().slice(10), s.code).toBe("T00:00:00.000Z");
    }
  });

  it("dates an interchange by its newest survey on any of its lines", () => {
    // Every code names the same station, so they share one date.
    expect(stationModified("CC9")).toEqual(stationModified("EW8"));
  });

  it("takes the newest of several and ignores the unknown", () => {
    const a = new Date("2026-09-01T00:00:00Z");
    const b = new Date("2026-09-20T00:00:00Z");
    expect(newestOf([a, undefined, b])).toEqual(b);
    expect(newestOf([undefined])).toBeUndefined();
  });
});

describe("the proxy settles existence before anything streams", () => {
  const run = (path: string) => proxy(new NextRequest(`https://mrtkiasu.com${path}`));
  const rewrote = (r: Response) => r.headers.get("x-middleware-rewrite");

  it("404s a station, line or route that does not exist", () => {
    for (const path of ["/station/XX99", "/line/ZZZ", "/route/nowhere/bugis", "/route/bugis/nowhere", "/station/%E0%A4%A"]) {
      expect(rewrote(run(path)), path).toContain("/_unknown");
    }
  });

  it("moves retired and oddly written addresses with a real 308", () => {
    const cases: [string, string][] = [
      ["/station/CE1", "/station/CC34"],
      ["/station/ew8", "/station/EW8"],
      ["/line/ewl", "/line/EWL"],
      ["/route/Paya%20Lebar/Bugis", "/route/paya-lebar/bugis"],
    ];
    for (const [from, to] of cases) {
      const r = run(from);
      expect(r.status, from).toBe(308);
      expect(new URL(r.headers.get("location")!).pathname, from).toBe(to);
    }
  });

  it("keeps the query on a redirect, so a shared ?exit= still applies", () => {
    const r = run("/route/Paya%20Lebar/bugis?exit=B");
    expect(new URL(r.headers.get("location")!).search).toBe("?exit=B");
  });

  it("lets every real page through untouched", () => {
    for (const path of ["/station/EW8", "/station/CC9", "/line/EWL", "/route/paya-lebar/bugis"]) {
      const r = run(path);
      expect(r.headers.get("x-middleware-next"), path).toBe("1");
    }
  });
});
