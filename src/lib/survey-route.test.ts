import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The survey route's contract with the form.
 *
 * One landing usually holds more than one thing — the escalator and the stairs
 * beside it are one walk from the train — so a survey may describe several at
 * the same door. The rules worth protecting: the batch is stored as separate
 * reviewable rows but written all-or-nothing, a batch with one bad member
 * stores nothing, and the older single-`feature` shape still works.
 */

const saveSubmissions = vi.fn();
const isConfigured = vi.fn();

vi.mock("@/lib/surveys-db", () => ({
  saveSubmissions: (...args: unknown[]) => saveSubmissions(...args),
  isConfigured: () => isConfigured(),
}));

// EW8 is a 6-car East-West platform: 24 doors.
const escalator = {
  type: "escalator",
  doorIndex: 10,
  leadsTo: ["A", "E"],
  travel: "up",
  source: "survey",
  confidence: "verified",
  verifiedAt: "2026-09-15",
  sourceNote: "Field survey at Paya Lebar",
};
const stairs = { ...escalator, type: "stairs", travel: undefined };

function post(payload: Record<string, unknown>) {
  return new Request("https://mrtkiasu.com/api/survey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stationCode: "EW8", direction: "asc", ...payload }),
  });
}

let POST: (r: Request) => Promise<Response>;

beforeEach(async () => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  saveSubmissions.mockReset();
  isConfigured.mockReset();
  isConfigured.mockReturnValue(true);
  saveSubmissions.mockResolvedValue(undefined);
  // Production is the path that stores claims; development writes the dataset.
  vi.stubEnv("NODE_ENV", "production");
  ({ POST } = await import("@/app/api/survey/route"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/survey", () => {
  it("stores a landing's devices as separate rows in one write", async () => {
    const res = await POST(post({ features: [escalator, stairs] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, pending: true, stored: 2 });
    // One call, because the rows have to arrive together: a landing stored
    // with its stairs missing looks complete and is not.
    expect(saveSubmissions).toHaveBeenCalledOnce();
    const rows = saveSubmissions.mock.calls[0][0] as { feature: { type: string } }[];
    expect(rows.map((r) => r.feature.type)).toEqual(["escalator", "stairs"]);
  });

  it("gives every row in one submission the same timestamp", async () => {
    await POST(post({ features: [escalator, stairs] }));
    const rows = saveSubmissions.mock.calls[0][0] as { submittedAt: string }[];
    expect(new Set(rows.map((r) => r.submittedAt)).size).toBe(1);
  });

  it("still accepts the older single-feature shape", async () => {
    const res = await POST(post({ feature: escalator }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pending: true, stored: 1 });
    expect((saveSubmissions.mock.calls[0][0] as unknown[]).length).toBe(1);
  });

  it("stores nothing when one member of a batch is invalid", async () => {
    const res = await POST(post({ features: [escalator, { ...stairs, doorIndex: 99 }] }));

    expect(res.status).toBe(400);
    const body = await res.json();
    // Numbered, so the surveyor is told which of the two to fix.
    expect(body.details.join(" ")).toContain("feature 2");
    expect(saveSubmissions).not.toHaveBeenCalled();
  });

  it("refuses two of the same type, which would be indistinguishable", async () => {
    const res = await POST(post({ features: [escalator, { ...escalator, leadsTo: ["B"] }] }));

    expect(res.status).toBe(400);
    expect((await res.json()).details).toContain("features must not repeat a type");
    expect(saveSubmissions).not.toHaveBeenCalled();
  });

  it("refuses a batch longer than a landing could hold", async () => {
    const res = await POST(post({ features: [escalator, stairs, escalator, stairs] }));

    expect(res.status).toBe(400);
    expect(saveSubmissions).not.toHaveBeenCalled();
  });

  it("refuses a survey that describes nothing", async () => {
    const res = await POST(post({ features: [] }));

    expect(res.status).toBe(400);
    expect(saveSubmissions).not.toHaveBeenCalled();
  });

  it("refuses 'there is a better one' when nothing says where this one goes", async () => {
    // Demoting a feature against nothing would just hide it.
    const res = await POST(post({ features: [{ ...stairs, leadsTo: [], secondary: true }] }));

    expect(res.status).toBe(400);
    expect((await res.json()).details.join(" ")).toContain("secondary needs leadsTo");
    expect(saveSubmissions).not.toHaveBeenCalled();
  });

  it("accepts a feature marked as the long way round", async () => {
    const res = await POST(post({ features: [{ ...stairs, secondary: true }] }));

    expect(res.status).toBe(200);
    const rows = saveSubmissions.mock.calls[0][0] as { feature: { secondary?: boolean } }[];
    expect(rows[0].feature.secondary).toBe(true);
  });

  it("tells the form to keep the work when the write fails", async () => {
    saveSubmissions.mockRejectedValue(new Error("connection refused"));

    const res = await POST(post({ features: [escalator, stairs] }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ retain: true });
  });
});
