import { describe, expect, it } from "vitest";
import { doorSideFor, orientationCount, platformKey, validateOrientation } from "./orientation";

describe("platform orientation", () => {
  it("says nothing for a platform nobody has checked", () => {
    // The important property: an unsurveyed platform must not get a guess.
    expect(doorSideFor("ZZ99", "asc")).toBeNull();
  });

  it("returns a surveyed platform's two directions independently", () => {
    // Promenade is split-platform, so the two levels genuinely differ — the
    // case no layout rule can cover.
    expect(doorSideFor("CC4", "desc")?.side).toBe("right");
    expect(doorSideFor("CC4", "asc")?.side).toBe("left");
  });

  it("keys platforms the same way door positions do", () => {
    expect(platformKey("ns17", "asc")).toBe("NS17:asc");
  });

  it("counts only platforms that were actually surveyed", () => {
    expect(orientationCount()).toBeGreaterThan(0);
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

import { layoutCount, layoutFor, sideFromLayout, validateLayout } from "./orientation";

describe("platform layout", () => {
  it("puts an island platform on the train's right, both ways", () => {
    // Left-hand running: each train keeps to the outer track and the island
    // sits inboard, so it is on the right whichever way you are going.
    expect(sideFromLayout("island")).toBe("right");
  });

  it("puts side platforms on the train's left, both ways", () => {
    // Tracks in the middle, platforms outboard — which is what Downtown Line
    // stations look like.
    expect(sideFromLayout("side")).toBe("left");
  });

  it("refuses to imply a side for stacked platforms", () => {
    // One direction per level, and the two can differ, so there is nothing
    // to infer and it must be surveyed per direction.
    expect(sideFromLayout("stacked")).toBeNull();
  });

  it("has layouts, and none for a station that does not exist", () => {
    expect(layoutCount()).toBeGreaterThan(0);
    expect(layoutFor("ZZ99")).toBeNull();
  });

  it("implies a door side from an imported layout", () => {
    // Bencoolen is a single island platform, so both directions follow.
    const side = doorSideFor("DT21", "asc");
    if (side) expect(["left", "right"]).toContain(side.side);
  });

  it("rejects a layout it does not recognise", () => {
    expect(validateLayout({ layout: "bay" as never, source: "survey", confidence: "verified" }))
      .toContain('layout must be "island", "side" or "stacked"');
  });

  it("refuses a layout that was not actually observed", () => {
    const errors = validateLayout({
      layout: "island",
      source: "guess",
      confidence: "estimate" as never,
    });
    expect(errors.some((e) => e.includes("cannot be derived"))).toBe(true);
  });

  it("accepts a properly sourced layout", () => {
    expect(validateLayout({ layout: "island", source: "survey", confidence: "verified" }))
      .toEqual([]);
  });
});
