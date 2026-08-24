/**
 * Server-side LTA DataMall client.
 *
 * One AccountKey lives here and never leaves the server. The `server-only`
 * import makes an accidental client import a build error rather than a
 * silently leaked credential.
 *
 * Caching strategy — the app must stay comfortably inside DataMall's limits:
 *
 *  1. Next's Data Cache (`next.revalidate`) is the primary layer. On Vercel it
 *     is shared across instances, so N concurrent users cost one upstream call
 *     per TTL window, not N.
 *  2. An in-process single-flight map collapses concurrent misses within one
 *     instance, so a cold start under load still makes one upstream call.
 *  3. A last-known-good store serves stale data if DataMall errors or times
 *     out. A slightly old crowd level beats a broken page, and it stops a
 *     failing upstream from turning into a retry storm.
 *
 * TTLs are matched to how often LTA actually refreshes each dataset — polling
 * faster than the source updates spends quota for nothing.
 */

import "server-only";

const BASE = "https://datamall2.mytransport.sg/ltaodataservice";

/** How often LTA refreshes each dataset, per the DataMall API guide. */
export const TTL = {
  /** Crowd density recomputes every 10 min; half that keeps it fresh cheaply. */
  crowdRealTime: 300,
  /** Forecast is generated daily. */
  crowdForecast: 3600,
  /** Alerts are ad hoc but this is the one thing users need promptly. */
  alerts: 60,
  /** Lift maintenance is ad hoc and rarely changes within a session. */
  facilities: 600,
} as const;

export class LtaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LtaError";
  }
}

function accountKey(): string {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    throw new LtaError(
      "LTA_ACCOUNT_KEY is not set. Add it to .env.local — see README.",
    );
  }
  return key;
}

interface CacheEntry {
  data: unknown;
  /** When this payload actually came back from DataMall. */
  fetchedAt: number;
  /** After this, the entry is refreshed on next use. */
  expiresAt: number;
}

/** Explicit TTL cache — the layer we control and can assert on in tests. */
const cache = new Map<string, CacheEntry>();
/** In-flight requests per key, to collapse concurrent misses. */
const inFlight = new Map<string, Promise<CacheEntry>>();

/** Counts real upstream calls. Exposed so tests can prove caching works. */
let upstreamCalls = 0;
export function upstreamCallCount(): number {
  return upstreamCalls;
}
export function __resetLtaCache(): void {
  cache.clear();
  inFlight.clear();
  upstreamCalls = 0;
}

export interface LtaResult<T> {
  data: T;
  /** True when DataMall failed and we fell back to an expired payload. */
  stale: boolean;
  /** When this payload actually came back from DataMall, not when it was served. */
  fetchedAt: number;
}

async function request<T>(path: string, ttlSeconds: number): Promise<LtaResult<T>> {
  const url = `${BASE}/${path}`;
  const now = Date.now();

  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) {
    return { data: cached.data as T, stale: false, fetchedAt: cached.fetchedAt };
  }

  // Collapse concurrent misses so a burst of traffic costs one upstream call.
  let task = inFlight.get(url);
  if (!task) {
    task = (async (): Promise<CacheEntry> => {
      upstreamCalls += 1;
      const res = await fetch(url, {
        headers: { AccountKey: accountKey(), accept: "application/json" },
        // We manage freshness ourselves above; this is a second line of defence
        // that also dedupes across instances on Vercel's shared Data Cache.
        next: { revalidate: ttlSeconds },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new LtaError(`DataMall responded ${res.status} for ${path}`, res.status);
      }

      const body = (await res.json()) as { value?: T };
      if (body?.value === undefined) {
        throw new LtaError(`DataMall response for ${path} had no "value" field`);
      }

      const at = Date.now();
      const entry: CacheEntry = {
        data: body.value,
        fetchedAt: at,
        expiresAt: at + ttlSeconds * 1000,
      };
      cache.set(url, entry);
      return entry;
    })().finally(() => {
      inFlight.delete(url);
    });
    inFlight.set(url, task);
  }

  try {
    const entry = await task;
    return { data: entry.data as T, stale: false, fetchedAt: entry.fetchedAt };
  } catch (err) {
    // An expired entry still beats an error page, and serving it stops a
    // failing upstream from turning into a retry storm.
    if (cached) {
      console.warn(`[lta] ${path} failed, serving stale data:`, err);
      return { data: cached.data as T, stale: true, fetchedAt: cached.fetchedAt };
    }
    throw err instanceof LtaError
      ? err
      : new LtaError(`DataMall request for ${path} failed: ${String(err)}`);
  }
}

/* ----------------------------- Crowd density ----------------------------- */

/** LTA reports crowding as low / medium / high, or NA when unavailable. */
export type CrowdLevel = "l" | "m" | "h" | "NA";

export interface CrowdReading {
  Station: string;
  StartTime: string;
  EndTime: string;
  CrowdLevel: CrowdLevel;
}

/** Line codes as DataMall's crowd endpoints expect them. */
export type CrowdLineCode =
  | "CCL" | "CEL" | "CGL" | "DTL" | "EWL" | "NEL"
  | "NSL" | "BPL" | "SLRT" | "PLRT" | "TEL";

export function getCrowdRealTime(line: CrowdLineCode) {
  return request<CrowdReading[]>(`PCDRealTime?TrainLine=${line}`, TTL.crowdRealTime);
}

export interface CrowdForecastLine {
  Date: string;
  Stations: { Station: string; Interval: { Start: string; CrowdLevel: CrowdLevel }[] }[];
}

export function getCrowdForecast(line: CrowdLineCode) {
  return request<CrowdForecastLine[]>(`PCDForecast?TrainLine=${line}`, TTL.crowdForecast);
}

/* ------------------------------- Alerts ---------------------------------- */

/**
 * Note: this endpoint returns an OBJECT under `value`, not an array — unlike
 * every other DataMall endpoint. Verified against the live API.
 */
export interface TrainServiceAlerts {
  /** 1 = normal service, 2 = disrupted. */
  Status: 1 | 2;
  AffectedSegments: {
    Line: string;
    Direction: string;
    Stations: string;
    FreePublicBus: string;
    FreeMRTShuttle: string;
    MRTShuttleDirection: string;
  }[];
  Message: { Content: string; CreatedDate: string }[];
}

export function getTrainServiceAlerts() {
  return request<TrainServiceAlerts>("TrainServiceAlerts", TTL.alerts);
}

/* --------------------------- Lift maintenance ---------------------------- */

export interface LiftMaintenance {
  Line: string;
  StationCode: string;
  StationName: string;
  LiftID?: string;
  LiftDesc?: string;
}

export function getLiftMaintenance() {
  return request<LiftMaintenance[]>("v2/FacilitiesMaintenance", TTL.facilities);
}

/** Whether the app was configured with a key at all — drives graceful degradation. */
export function isLtaConfigured(): boolean {
  return Boolean(process.env.LTA_ACCOUNT_KEY);
}
