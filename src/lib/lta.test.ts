import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module is server-only; stub the guard so it can be imported under test.
vi.mock("server-only", () => ({}));

const { getCrowdRealTime, getTrainServiceAlerts, upstreamCallCount, __resetLtaCache } =
  await import("./lta");

const CROWD_PAYLOAD = {
  value: [
    { Station: "NE1", StartTime: "t0", EndTime: "t1", CrowdLevel: "l" },
  ],
};

describe("LTA client caching", () => {
  beforeEach(() => {
    process.env.LTA_ACCOUNT_KEY = "test-key";
    __resetLtaCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("makes exactly one upstream call for repeated reads inside the TTL", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CROWD_PAYLOAD), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 10; i++) {
      await getCrowdRealTime("NEL");
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upstreamCallCount()).toBe(1);
  });

  it("reports a stable fetchedAt across cache hits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify(CROWD_PAYLOAD), { status: 200 })),
      ),
    );

    const first = await getCrowdRealTime("NEL");
    await new Promise((r) => setTimeout(r, 5));
    const second = await getCrowdRealTime("NEL");

    // fetchedAt must describe when LTA was called, not when we served it.
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(second.stale).toBe(false);
  });

  it("collapses a burst of concurrent misses into one upstream call", async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(new Response(JSON.stringify(CROWD_PAYLOAD), { status: 200 })),
            20,
          ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all(
      Array.from({ length: 25 }, () => getCrowdRealTime("NEL")),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(25);
    expect(new Set(results.map((r) => r.fetchedAt)).size).toBe(1);
  });

  it("caches each line separately", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(CROWD_PAYLOAD), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getCrowdRealTime("NEL");
    await getCrowdRealTime("EWL");
    await getCrowdRealTime("NEL");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends the AccountKey as a header and never in the URL", async () => {
    const fetchMock = vi.fn((_url: string | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(CROWD_PAYLOAD), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getCrowdRealTime("NEL");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-key");
    expect((init?.headers as Record<string, string>).AccountKey).toBe("test-key");
  });

  it("serves stale data when DataMall fails after a successful fetch", async () => {
    let call = 0;
    const fetchMock = vi.fn(() => {
      call += 1;
      return Promise.resolve(
        call === 1
          ? new Response(JSON.stringify(CROWD_PAYLOAD), { status: 200 })
          : new Response("upstream exploded", { status: 500 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const fresh = await getCrowdRealTime("NEL");
    expect(fresh.stale).toBe(false);

    // Expire the entry so the next read must go upstream, and fail there.
    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    const stale = await getCrowdRealTime("NEL");

    expect(stale.stale).toBe(true);
    expect(stale.data).toEqual(CROWD_PAYLOAD.value);
    expect(stale.fetchedAt).toBe(fresh.fetchedAt);
  });

  it("throws when DataMall fails and there is nothing cached to fall back to", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("nope", { status: 503 }))));

    await expect(getCrowdRealTime("NEL")).rejects.toThrow(/503/);
  });

  it("throws a helpful error when the key is missing rather than calling LTA", async () => {
    delete process.env.LTA_ACCOUNT_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTrainServiceAlerts()).rejects.toThrow(/LTA_ACCOUNT_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
