import { describe, expect, it } from "vitest";
import { createProjector, extentOf } from "./map-projection";

/** Singapore's real corners, near enough for orientation checks. */
const WEST = { lat: 1.3382, lng: 103.637 };   // Tuas Link
const EAST = { lat: 1.3644, lng: 103.9883 };  // Changi Airport
const NORTH = { lat: 1.4489, lng: 103.82 };   // Sembawang-ish
const SOUTH = { lat: 1.2655, lng: 103.8221 }; // HarbourFront-ish
const ALL = [WEST, EAST, NORTH, SOUTH];

describe("map projection", () => {
  it("refuses to compute an extent with no points", () => {
    expect(() => extentOf([])).toThrow();
  });

  it("puts north above south on screen", () => {
    // Screen y grows downward while latitude grows upward. Getting this wrong
    // renders the whole country upside down and still looks plausible.
    const project = createProjector(ALL, 400, 300);
    expect(project(NORTH).y).toBeLessThan(project(SOUTH).y);
  });

  it("puts east to the right of west", () => {
    const project = createProjector(ALL, 400, 300);
    expect(project(EAST).x).toBeGreaterThan(project(WEST).x);
  });

  it("keeps every point inside the box", () => {
    const project = createProjector(ALL, 400, 300);
    for (const p of ALL) {
      const { x, y } = project(p);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(400);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(300);
    }
  });

  it("respects padding on every side", () => {
    const pad = 20;
    const project = createProjector(ALL, 400, 300, pad);
    for (const p of ALL) {
      const { x, y } = project(p);
      expect(x).toBeGreaterThanOrEqual(pad - 0.001);
      expect(x).toBeLessThanOrEqual(400 - pad + 0.001);
      expect(y).toBeGreaterThanOrEqual(pad - 0.001);
      expect(y).toBeLessThanOrEqual(300 - pad + 0.001);
    }
  });

  it("keeps Singapore's true aspect ratio", () => {
    // Roughly 39km wide by 20km tall, so about 1.9:1.
    //
    // An earlier version asserted only `w > h * 1.5`, which passed while the
    // projection was mixing degrees on x with radians on y — an aspect of 110
    // that rendered the country as a horizontal line. A bound on both sides is
    // what actually pins the shape.
    const project = createProjector(ALL, 300, 300);
    const w = project(EAST).x - project(WEST).x;
    const h = project(SOUTH).y - project(NORTH).y;
    expect(w / h).toBeGreaterThan(1.7);
    expect(w / h).toBeLessThan(2.2);
  });

  it("centres the network in the leftover space", () => {
    const project = createProjector(ALL, 400, 400);
    const top = project(NORTH).y;
    const bottom = project(SOUTH).y;
    // Equal slack above and below.
    expect(top).toBeCloseTo(400 - bottom, 5);
  });

  it("emits coordinates short enough to survive SSR", () => {
    // Node and the browser can disagree on the last digits of Math.log and
    // Math.tan. Full-precision output made the server and client HTML differ,
    // which broke hydration and left the map inert. Anything at or under two
    // decimals is identical on both sides.
    const project = createProjector(ALL, 1000, 560, 28);
    for (const p of ALL) {
      const { x, y } = project(p);
      expect(x).toBe(Math.round(x * 100) / 100);
      expect(y).toBe(Math.round(y * 100) / 100);
    }
  });

  it("is deterministic", () => {
    const a = createProjector(ALL, 400, 300);
    const b = createProjector(ALL, 400, 300);
    expect(a(EAST)).toEqual(b(EAST));
  });
});
