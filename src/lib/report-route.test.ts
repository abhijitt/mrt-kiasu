import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The report route's contract with the form.
 *
 * The rule these protect: any response that is not a success must tell the
 * form to hand the text back. Someone standing on a platform who has just
 * typed out a wrong door position must never lose it to a server fault.
 */

const saveReport = vi.fn();
const isConfigured = vi.fn();

vi.mock("@/lib/reports-db", () => ({
  saveReport: (...args: unknown[]) => saveReport(...args),
  isConfigured: () => isConfigured(),
}));

const body = {
  type: "data",
  message: "Car 3 is wrong at Bishan",
  context: { path: "/station/NS17", locale: "en" },
};

function post(payload: unknown = body) {
  return new Request("https://mrtkiasu.com/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

let POST: (r: Request) => Promise<Response>;

beforeEach(async () => {
  vi.resetModules();
  // The route logs deliberately on the failure paths below. Silenced so a
  // genuinely unexpected error still stands out in the run.
  vi.spyOn(console, "error").mockImplementation(() => {});
  saveReport.mockReset();
  isConfigured.mockReset();
  delete process.env.REPORT_WEBHOOK_URL;
  // Typed readonly, so stubbed rather than assigned. Production is the
  // environment that matters: the dev-only local-file fallback must not
  // mask a missing destination.
  vi.stubEnv("NODE_ENV", "production");
  ({ POST } = await import("@/app/api/report/route"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/report", () => {
  it("stores the report when a database is configured", async () => {
    isConfigured.mockReturnValue(true);
    saveReport.mockResolvedValue(undefined);

    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, delivered: "database" });
    expect(saveReport).toHaveBeenCalledOnce();
  });

  it("tells the form to keep the text when the database write fails", async () => {
    isConfigured.mockReturnValue(true);
    saveReport.mockRejectedValue(new Error("connection refused"));

    const res = await POST(post());
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ retain: true });
  });

  it("never leaks the failure's details to the caller", async () => {
    isConfigured.mockReturnValue(true);
    // A driver error can name the host, the database and sometimes the user.
    saveReport.mockRejectedValue(new Error("password authentication failed for user 'neondb_owner'"));

    const res = await POST(post());
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("neondb_owner");
    expect(text).not.toContain("password");
  });

  it("tells the form to keep the text when nothing is configured", async () => {
    isConfigured.mockReturnValue(false);

    const res = await POST(post());
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ retain: true });
  });

  it("rejects an invalid report so the reporter can fix it", async () => {
    isConfigured.mockReturnValue(true);

    const res = await POST(post({ ...body, message: "" }));
    expect(res.status).toBe(400);
    expect(saveReport).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    isConfigured.mockReturnValue(true);
    const res = await POST(
      new Request("https://mrtkiasu.com/api/report", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });
});
