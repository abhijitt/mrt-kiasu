import { describe, expect, it } from "vitest";
import { exceedsTapSlop, TAP_SLOP_PX } from "./gesture";

describe("tap versus drag", () => {
  it("treats a perfectly still pointer as a tap", () => {
    expect(exceedsTapSlop({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(false);
  });

  it("tolerates the jitter a mouse produces between press and release", () => {
    // This is the case that broke selection on a laptop while touch was fine:
    // a click that moves one or two pixels must still be a click.
    for (const d of [1, 2, 3]) {
      expect(exceedsTapSlop({ x: 100, y: 100 }, { x: 100 + d, y: 100 + d }), `${d}px`).toBe(
        false,
      );
    }
  });

  it("calls a real drag a drag", () => {
    expect(exceedsTapSlop({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(true);
    expect(exceedsTapSlop({ x: 100, y: 100 }, { x: 100, y: 160 })).toBe(true);
  });

  it("measures diagonally, not per axis", () => {
    // 5px on each axis is 7.07px of travel — past the slop, even though
    // neither axis alone exceeds it.
    expect(exceedsTapSlop({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(true);
  });

  it("sits right at the boundary predictably", () => {
    expect(exceedsTapSlop({ x: 0, y: 0 }, { x: TAP_SLOP_PX, y: 0 })).toBe(false);
    expect(exceedsTapSlop({ x: 0, y: 0 }, { x: TAP_SLOP_PX + 0.1, y: 0 })).toBe(true);
  });
});
