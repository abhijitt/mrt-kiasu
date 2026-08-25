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

export interface PlatformOrientation {
  side: DoorSide;
  source: string;
  confidence: "verified";
  verifiedAt?: string;
  sourceNote?: string;
}

const ORIENTATION = (positions.orientation ?? {}) as Record<string, PlatformOrientation>;

export function platformKey(stationCode: string, direction: "asc" | "desc"): string {
  return `${stationCode.toUpperCase()}:${direction}`;
}

/** Null when nobody has checked this platform. */
export function doorSideFor(
  stationCode: string,
  direction: "asc" | "desc",
): PlatformOrientation | null {
  return ORIENTATION[platformKey(stationCode, direction)] ?? null;
}

/** How many platforms have been surveyed, for the honesty banner. */
export function orientationCount(): number {
  return Object.keys(ORIENTATION).length;
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
