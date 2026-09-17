import { describe, expect, it } from "vitest";
import { shortTargets, spreadOut } from "@/lib/declutter";

/**
 * No two marks on a platform may touch.
 *
 * The complaint that prompted this: an escalator and the stairs beside it,
 * drawn as block characters, sat 1.3 units apart with 8.7-unit glyphs — under
 * two pixels of daylight once rendered, so the pair read as one smudged mark.
 * Separation is now a property of the layout rather than a consequence of
 * where the doors happened to fall.
 */
describe("marks are kept apart along the platform", () => {
  const LO = 37; // padX 30 + half of a 14-unit mark
  const HI = 283; // padX + inner 260 - half a mark
  const PITCH = 20;
  const spacings = (xs: number[]) => {
    const at = [...spreadOut(xs, PITCH, LO, HI)].sort((a, b) => a - b);
    return at.slice(1).map((x, i) => x - at[i]);
  };

  it("separates two things at one door", () => {
    // Paya Lebar door 10: an escalator and the stairs on the same landing.
    const x = 140;
    expect(Math.min(...spacings([x, x]))).toBeGreaterThanOrEqual(PITCH - 0.001);
  });

  it("separates adjacent doors, which grouping by door never did", () => {
    // 10.8 units apart on a 24-door line, against a 14-unit mark.
    expect(Math.min(...spacings([100, 110.8]))).toBeGreaterThanOrEqual(PITCH - 0.001);
  });

  it("keeps a whole landing on the bar rather than hanging it off the end", () => {
    // Three things at the last door: fanning alone would push one past the
    // platform, which draws a lift standing on the track.
    const at = spreadOut([HI, HI, HI], PITCH, LO, HI);
    expect(Math.min(...at)).toBeGreaterThanOrEqual(LO);
    expect(Math.max(...at)).toBeLessThanOrEqual(HI + 0.001);
  });

  it("leaves things that are already far apart where they are", () => {
    // Otherwise a mark stops meaning "here" and starts meaning "near here".
    expect(spreadOut([60, 160, 260], PITCH, LO, HI)).toEqual([60, 160, 260]);
  });

  it("returns positions in the order it was given, not sorted order", () => {
    // The caller pairs these with its own feature list by index; sorting them
    // silently would put the lift's mark on the stairs.
    expect(spreadOut([260, 60], PITCH, LO, HI)).toEqual([260, 60]);
  });
});

/**
 * A lift at an interchange reaches everywhere.
 *
 * Paya Lebar's serves seven targets, and "A/B/C/D/E/F/CCL" is fifteen
 * characters of a monospace face over a door eighteen units wide. Written out
 * in full, four neighbouring labels came out as "A/BDC/D/E/F.EXCL/DZCCL".
 */
describe("target lists are shortened to fit over a door", () => {
  it("writes a short list out in full", () => {
    expect(shortTargets(["A", "E"])).toBe("A/E");
    expect(shortTargets(["B", "C", "D"])).toBe("B/C/D");
  });

  it("counts the rest once the list stops fitting", () => {
    expect(shortTargets(["A", "B", "C", "D", "E", "F", "CCL"])).toBe("A/B+5");
  });

  it("collapses the duplicates a shared landing produces", () => {
    // The escalator and the stairs beside it both lead to A and E, and the
    // landing has one label, not the same one written twice.
    expect(shortTargets(["A", "E", "A", "E"])).toBe("A/E");
  });

  it("says nothing when nothing is known", () => {
    // An empty label is not drawn at all; "+0" would be noise.
    expect(shortTargets([])).toBe("");
  });
});
