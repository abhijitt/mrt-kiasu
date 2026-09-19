import { describe, expect, it } from "vitest";
import { barShare, plotHeight } from "@/components/CrowdForecast";

/**
 * How tall to draw four hours of crowd forecast.
 *
 * The plot used to be 64px always, with the bars anchored to the bottom, so a
 * quiet window drew 22px of bar under 42px of reserved emptiness. On its own
 * card that read as generous padding; once the crowd sections merged, the void
 * sat directly under the "Later" heading and read as a rendering fault.
 *
 * The plot is now only as tall as the busiest moment needs. What has to stay
 * true is that the shape survives — the chart exists to answer "when does it
 * get worse", and that answer lives in the bars' heights relative to each
 * other, not in their height relative to a fixed box.
 */
describe("the plot is as tall as the window needs", () => {
  it("gives a window containing a peak the full height", () => {
    expect(plotHeight(["l", "m", "h", "l"])).toBe(64);
  });

  it("shortens a window that never gets busy", () => {
    // 64 x 0.35 is 22, which the floor lifts to 26 — a chart, not a hairline.
    expect(plotHeight(["l", "l", "l", "l"])).toBe(26);
    expect(plotHeight(["l", "l", "l", "l"])).toBeLessThan(plotHeight(["l", "m"]));
  });

  it("never collapses a window with nothing to report", () => {
    expect(plotHeight(["NA", "NA"])).toBe(26);
    expect(plotHeight([])).toBe(26);
  });

  it("keeps the shape of the afternoon whatever the height", () => {
    // A medium is the same fraction of a high wherever it appears, so a rise
    // still looks like a rise.
    const window = ["l", "m", "h"] as const;
    expect(barShare("h", [...window])).toBe(100);
    expect(barShare("m", [...window])).toBeCloseTo(65);
    expect(barShare("l", [...window])).toBeCloseTo(35);
  });

  it("fills the shortened plot when every hour is the same", () => {
    // Flat is flat. Drawing it as a short full strip says that; drawing it as
    // a third of a tall box says nothing the colour has not already said.
    expect(barShare("l", ["l", "l", "l"])).toBe(100);
  });

  it("still ranks a gap in the data below the quietest real reading", () => {
    // "NA" is not a level of crowding, and a bar for it must not imply one.
    expect(barShare("NA", ["l", "NA"])).toBeLessThan(barShare("l", ["l", "NA"]));
  });
});
