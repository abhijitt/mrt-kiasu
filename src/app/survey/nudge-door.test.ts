import { describe, expect, it } from "vitest";
import { nudgeDoor } from "./[code]/[direction]/SurveyForm";

/**
 * The arrow beside the survey diagram. It used to step from `selected ?? 1`,
 * so a press with nothing selected - which is what every save left behind -
 * landed on door 1 or 2, the end of the train. Hillview's lift, recorded as
 * "one door along from the escalator at door 8", went in at door 1.
 */
describe("nudging the selected door", () => {
  it("moves one door from the selection", () => {
    expect(nudgeDoor(8, -1, 12)).toBe(7);
    expect(nudgeDoor(8, 1, 12)).toBe(9);
  });

  it("stays on the train", () => {
    expect(nudgeDoor(1, -1, 12)).toBe(1);
    expect(nudgeDoor(12, 1, 12)).toBe(12);
  });

  it("with nothing to move from, picks the middle rather than an end", () => {
    expect(nudgeDoor(null, -1, 12)).toBe(6);
    expect(nudgeDoor(null, 1, 12)).toBe(6);
    expect(nudgeDoor(null, 1, 20)).toBe(10);
  });
});
