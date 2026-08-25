import { describe, expect, it } from "vitest";
import { durationShape, splitDuration } from "./duration";

describe("durations", () => {
  it("leaves short waits alone", () => {
    expect(durationShape(9)).toBe("minutes");
    expect(splitDuration(9)).toEqual({ hours: 0, minutes: 9 });
  });

  it("breaks long waits into hours and minutes", () => {
    // The case that prompted this: "286 min" is nobody's mental model.
    expect(splitDuration(286)).toEqual({ hours: 4, minutes: 46 });
    expect(durationShape(286)).toBe("hoursAndMinutes");
  });

  it("uses a distinct shape for exact hours, so nothing says '4h 0m'", () => {
    expect(durationShape(120)).toBe("hours");
    expect(splitDuration(120)).toEqual({ hours: 2, minutes: 0 });
  });

  it("switches over exactly at the hour", () => {
    expect(durationShape(59)).toBe("minutes");
    expect(durationShape(60)).toBe("hours");
    expect(durationShape(61)).toBe("hoursAndMinutes");
  });

  it("rounds rather than truncating", () => {
    expect(splitDuration(59.6)).toEqual({ hours: 1, minutes: 0 });
  });

  it("never returns a negative duration", () => {
    expect(splitDuration(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});
