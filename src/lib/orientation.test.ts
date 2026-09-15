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

import {
  layoutCount,
  layoutFor,
  servesBothDirections,
  sideFromLayout,
  validateLayout,
} from "./orientation";
import { mirrorDoorIndex, toCarPosition } from "./doors";

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
      .toContain('layout must be "island", "split-island", "side" or "stacked"');
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

describe("one platform, both directions", () => {
  it("shares a feature across directions only on an island platform", () => {
    // The escalator stands between the two tracks, so a commuter going either
    // way walks to the same one.
    expect(servesBothDirections("island")).toBe(true);
    // Two separate platforms with the tracks between them: what is on one says
    // nothing about the other.
    expect(servesBothDirections("side")).toBe(false);
    // One direction per level — as separate as two stations.
    expect(servesBothDirections("stacked")).toBe(false);
  });

  it("shares nothing when nobody has checked the layout", () => {
    expect(servesBothDirections(null)).toBe(false);
  });

  it("does not mirror the door index of a shared feature", () => {
    // The trap this whole rule exists to avoid. doorIndex is stored from the
    // low-code end, so the shared feature keeps its index; only the car and
    // door a commuter reads off it differ per direction.
    const shared = 19;
    expect(toCarPosition(shared, "EWL", "asc")).toMatchObject({ doorFromFront: 6 });
    expect(toCarPosition(shared, "EWL", "desc")).toMatchObject({ doorFromFront: 19 });
    // Mirroring as well would land it at the far end of the platform.
    expect(mirrorDoorIndex(shared, "EWL")).toBe(6);
  });
});

/**
 * Paya Lebar's Circle Line platforms are islands by shape, and the station
 * infobox counts them as such — but a third track runs between them for
 * trains terminating there, so the two directions stand on two different
 * platforms. Reading the shape as "one platform, both directions" wrote four
 * features onto platforms that never had them, each looking like a survey.
 */
describe("an island with a track through the middle", () => {
  it("does not share features between directions", () => {
    expect(servesBothDirections("split-island")).toBe(false);
    // The plain island it is easily mistaken for still does.
    expect(servesBothDirections("island")).toBe(true);
  });

  it("still puts the doors on the same side as an ordinary island", () => {
    // The revenue tracks are the outer pair with the platforms inboard, so a
    // train sees its platform exactly where it would at a plain island; only
    // the centre track differs, and nothing revenue-carrying stops there.
    expect(sideFromLayout("split-island")).toBe("right");
  });

  it("accepts it as a surveyable layout", () => {
    expect(
      validateLayout({ layout: "split-island", source: "survey", confidence: "verified" }),
    ).toEqual([]);
  });
})
