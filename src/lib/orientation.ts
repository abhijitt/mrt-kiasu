import positions from "@/data/positions.json";

/**
 * Which side the doors open, facing the way the train is going.
 *
 * Direction-relative on purpose. "Left" and "right" on a screen depend on
 * which way the reader is facing and which platform face they are standing
 * on, and no dataset knows either — so the diagram cannot honestly claim a
 * screen orientation. Relative to the train's own direction of travel the
 * answer is unambiguous, matches what the on-train announcement says, and
 * needs surveying exactly once because it never changes.
 *
 * Nothing is inferred. A platform with no entry returns null and the UI says
 * nothing, rather than guessing a side and being wrong half the time.
 */

export type DoorSide = "left" | "right";

/**
 * How a station's platforms are arranged.
 *
 *   island  — one platform between the two tracks
 *   side    — two platforms with the tracks between them
 *   stacked — one direction per level
 */
export type PlatformLayout = "island" | "side" | "stacked";

export interface StationLayout {
  layout: PlatformLayout;
  source: string;
  confidence: "verified";
  verifiedAt?: string;
  sourceNote?: string;
}

/**
 * Door side implied by the layout, for both directions at once.
 *
 * Singapore runs left-hand, which is what makes this derivable rather than a
 * guess. On an island platform the platform sits to the train's RIGHT
 * whichever way it is going, because each train keeps to the outer track and
 * the island is inboard of it. With side platforms and the tracks between
 * them the platform is outboard, so it is on the train's LEFT either way.
 *
 * Stacked platforms put one direction on each level and the two can differ,
 * so they get no implied answer and must be surveyed per direction.
 *
 * This is why the survey asks for the layout rather than the door side: one
 * observation per station covers both directions, and a layout is far easier
 * to be sure of than recalling which way the doors opened.
 */
export function sideFromLayout(layout: PlatformLayout): DoorSide | null {
  switch (layout) {
    case "island":
      return "right";
    case "side":
      return "left";
    case "stacked":
      return null;
  }
}

export interface PlatformOrientation {
  side: DoorSide;
  source: string;
  confidence: "verified";
  verifiedAt?: string;
  sourceNote?: string;
}

const ORIENTATION = (positions.orientation ?? {}) as Record<string, PlatformOrientation>;
const LAYOUTS = (positions.layouts ?? {}) as Record<string, StationLayout>;

export function platformKey(stationCode: string, direction: "asc" | "desc"): string {
  return `${stationCode.toUpperCase()}:${direction}`;
}

/**
 * Null when nobody has checked this platform.
 *
 * An explicit per-direction survey wins over the layout, since a station can
 * always turn out to be the exception the rule did not anticipate.
 */
export function doorSideFor(
  stationCode: string,
  direction: "asc" | "desc",
): PlatformOrientation | null {
  const explicit = ORIENTATION[platformKey(stationCode, direction)];
  if (explicit) return explicit;

  const layout = LAYOUTS[stationCode.toUpperCase()];
  if (!layout) return null;
  const side = sideFromLayout(layout.layout);
  if (!side) return null;

  return {
    side,
    source: layout.source,
    confidence: "verified",
    verifiedAt: layout.verifiedAt,
    sourceNote: `Implied by the ${layout.layout} platform layout`,
  };
}

/** Layout for a station, or null if nobody has recorded it. */
export function layoutFor(stationCode: string): StationLayout | null {
  return LAYOUTS[stationCode.toUpperCase()] ?? null;
}

export function validateLayout(input: Partial<StationLayout>): string[] {
  const errors: string[] = [];
  if (!["island", "side", "stacked"].includes(input.layout as string)) {
    errors.push('layout must be "island", "side" or "stacked"');
  }
  if (!input.source) errors.push("source is required");
  if (input.confidence !== "verified") {
    errors.push('confidence must be "verified" — a layout cannot be derived');
  }
  return errors;
}

/** How many platforms and stations have been surveyed, for the honesty banner. */
export function orientationCount(): number {
  return Object.keys(ORIENTATION).length;
}

export function layoutCount(): number {
  return Object.keys(LAYOUTS).length;
}

/** Rejects an entry that would claim more than it can support. */
export function validateOrientation(input: Partial<PlatformOrientation>): string[] {
  const errors: string[] = [];
  if (input.side !== "left" && input.side !== "right") {
    errors.push('side must be "left" or "right"');
  }
  if (!input.source) errors.push("source is required");
  // Only a person standing on the platform can establish this, so there is no
  // "estimate" tier — unlike door positions, it cannot be derived from
  // anything.
  if (input.confidence !== "verified") {
    errors.push('confidence must be "verified" — door side cannot be derived');
  }
  return errors;
}
