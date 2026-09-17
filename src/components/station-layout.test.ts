import { describe, expect, it } from "vitest";
import { captionLines, markPositions } from "@/components/StationLayout";

/**
 * Two destination names on one bar.
 *
 * An island platform is a single bar serving both directions, so its captions
 * sit at the two ends of one line. They never strictly overlapped — Farrer
 * Road, the worst pair on the network, left 4.6 units between
 * "← Botanic Gardens" and "Holland Village →" — but a gap narrower than one
 * space reads as a single place name, and "Botanic Gardens Holland Village"
 * looks like somewhere you could go.
 */
const INNER = 260; // G.width 320 less padX 30 each side

describe("captions share a line only when they stay legible", () => {
  it("keeps short neighbours on one line", () => {
    // Aljunied: the plan this was checked against.
    expect(captionLines(["Paya Lebar", "Kallang"], INNER)).toBe(1);
    expect(captionLines(["Eunos", "Aljunied"], INNER)).toBe(1);
  });

  it("stacks the pair that collided", () => {
    expect(captionLines(["Botanic Gardens", "Holland Village"], INNER)).toBe(2);
    // Woodlands North / Woodlands South, the same length on the Thomson line.
    expect(captionLines(["Woodlands North", "Woodlands South"], INNER)).toBe(2);
  });

  it("never stacks a platform with one direction", () => {
    // A side or split-island face carries one name, which cannot collide with
    // anything — stacking it would cost a line and buy nothing.
    expect(captionLines(["Dhoby Ghaut"], INNER)).toBe(1);
    expect(captionLines([], INNER)).toBe(1);
  });

  it("counts the arrow and its space, not just the name", () => {
    // 15 characters each is 30, but what is drawn is 34, and the difference is
    // exactly what made the measured gap 4.6 units instead of a comfortable 34.
    const name = "x".repeat(15);
    expect(captionLines([name, name], INNER)).toBe(2);
    expect(captionLines(["x".repeat(13), "x".repeat(13)], INNER)).toBe(1);
  });
});

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
    const at = [...markPositions(xs, LO, HI)].sort((a, b) => a - b);
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
    const at = markPositions([HI, HI, HI], LO, HI);
    expect(Math.min(...at)).toBeGreaterThanOrEqual(LO);
    expect(Math.max(...at)).toBeLessThanOrEqual(HI + 0.001);
  });

  it("leaves things that are already far apart where they are", () => {
    // Otherwise a mark stops meaning "here" and starts meaning "near here".
    expect(markPositions([60, 160, 260], LO, HI)).toEqual([60, 160, 260]);
  });

  it("returns positions in the order it was given, not sorted order", () => {
    // The caller pairs these with its own feature list by index; sorting them
    // silently would put the lift's mark on the stairs.
    expect(markPositions([260, 60], LO, HI)).toEqual([260, 60]);
  });
});
