import { describe, expect, it } from "vitest";
import { captionLines } from "@/components/StationLayout";

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
