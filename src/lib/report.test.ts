import { afterEach, describe, expect, it } from "vitest";
import {
  MESSAGE_MAX,
  sanitiseReport,
  validateReport,
  type ErrorReport,
} from "@/lib/report-types";

const base: ErrorReport = {
  type: "data",
  message: "At Bishan the app said car 3 but the escalator is at car 1.",
  context: { path: "/station/NS17", locale: "en", reportedAt: "2026-01-01T00:00:00Z" },
};

describe("validateReport", () => {
  it("accepts a minimal valid report", () => {
    expect(validateReport(base)).toEqual([]);
  });

  it("requires a message, since a type alone tells us nothing", () => {
    expect(validateReport({ ...base, message: "   " })).toContain("message is required");
  });

  it("requires a known type", () => {
    expect(validateReport({ ...base, type: "spam" as never })).toHaveLength(1);
  });

  it("requires the page context that makes a report actionable", () => {
    const { context: _drop, ...rest } = base;
    expect(validateReport(rest)).toContain("context.path is required");
  });

  it("treats name and email as optional", () => {
    expect(validateReport({ ...base, name: "Abhi", email: "a@b.co" })).toEqual([]);
    expect(validateReport({ ...base, name: undefined, email: undefined })).toEqual([]);
  });

  it("rejects an email that cannot be one", () => {
    expect(validateReport({ ...base, email: "not-an-email" })).toContain(
      "email does not look like an address",
    );
  });

  it("rejects an over-long message rather than truncating silently", () => {
    expect(validateReport({ ...base, message: "x".repeat(MESSAGE_MAX + 1) })).toHaveLength(1);
  });
});

describe("sanitiseReport", () => {
  it("drops fields that are not part of the schema", () => {
    const dirty = { ...base, isAdmin: true, context: { ...base.context, token: "x" } };
    const clean = sanitiseReport(dirty as never);
    expect("isAdmin" in clean).toBe(false);
    expect("token" in clean.context).toBe(false);
  });

  it("omits empty optional contact fields instead of storing blanks", () => {
    const clean = sanitiseReport({ ...base, name: "  ", email: "" });
    expect("name" in clean).toBe(false);
    expect("email" in clean).toBe(false);
  });

  it("stamps its own timestamp rather than trusting the client's", () => {
    const clean = sanitiseReport({ ...base, context: { ...base.context, reportedAt: "nonsense" } });
    expect(Number.isNaN(Date.parse(clean.context.reportedAt))).toBe(false);
  });

  it("caps oversized input", () => {
    const clean = sanitiseReport({ ...base, message: "x".repeat(MESSAGE_MAX + 500) });
    expect(clean.message.length).toBe(MESSAGE_MAX);
  });
});

describe("environment stamping", () => {
  const original = process.env.VERCEL_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  });

  const body = {
    type: "data" as const,
    message: "wrong door",
    context: { path: "/station/NS17", locale: "en", reportedAt: "", env: "production" },
  };

  it("stamps the environment from the server, ignoring the body", () => {
    process.env.VERCEL_ENV = "preview";
    // The body claims production; the server knows better.
    expect(sanitiseReport(body).context.env).toBe("preview");
  });

  it("omits the environment entirely when not on Vercel", () => {
    delete process.env.VERCEL_ENV;
    expect(sanitiseReport(body).context.env).toBeUndefined();
  });
});
