import { describe, expect, it } from "vitest";
import { doorSideFor, orientationCount, platformKey, validateOrientation } from "./orientation";

describe("platform orientation", () => {
  it("says nothing when nobody has checked", () => {
    // The important property: an unsurveyed platform must not get a guess.
    expect(doorSideFor("NS17", "asc")).toBeNull();
  });

  it("keys platforms the same way door positions do", () => {
    expect(platformKey("ns17", "asc")).toBe("NS17:asc");
  });

  it("starts empty, and says so", () => {
    expect(orientationCount()).toBe(0);
  });

  it("rejects anything but a real side", () => {
    expect(validateOrientation({ side: "up" as never, source: "survey", confidence: "verified" }))
      .toContain('side must be "left" or "right"');
  });

  it("refuses an entry with no source", () => {
    expect(validateOrientation({ side: "left", confidence: "verified" })).toContain(
      "source is required",
    );
  });

  it("refuses anything less than verified, because it cannot be derived", () => {
    const errors = validateOrientation({
      side: "left",
      source: "guess",
      confidence: "estimate" as never,
    });
    expect(errors.some((e) => e.includes("cannot be derived"))).toBe(true);
  });

  it("accepts a properly sourced survey", () => {
    expect(
      validateOrientation({ side: "right", source: "survey", confidence: "verified" }),
    ).toEqual([]);
  });
});
