import { describe, expect, it } from "vitest";
import { isMeasured, transferTime } from "./transfers";

describe("transfer times", () => {
  it("falls back to the assumed default for an unmeasured interchange", () => {
    const t = transferTime("NS17", "CC15");
    expect(t.confidence).toBe("assumed");
    expect(t.minutes).toBeGreaterThan(0);
  });

  it("is order-independent", () => {
    // The walk takes the same time whichever platform you start on, so the
    // lookup must not depend on which code the caller happens to pass first.
    expect(transferTime("NS17", "CC15")).toEqual(transferTime("CC15", "NS17"));
  });

  it("is case-insensitive", () => {
    expect(transferTime("ns17", "cc15")).toEqual(transferTime("NS17", "CC15"));
  });

  it("marks the default as not measured", () => {
    expect(isMeasured(transferTime("NS17", "CC15"))).toBe(false);
  });
});
