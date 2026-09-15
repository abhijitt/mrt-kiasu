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
 *   island       — one platform between the two tracks
 *   split-island — island platforms with an extra track running between them,
 *                  used by services that terminate or branch off rather than
 *                  running through: the Circle Line trains that turn back at
 *                  Paya Lebar, the Changi shuttle at Tanah Merah. The defining
 *                  fact is that centre track, because it means each direction
 *                  gets its OWN platform. It looks like an island from where a
 *                  commuter stands and behaves like side platforms for
 *                  everything here.
 *   side         — two platforms with the tracks between them
 *   stacked      — one direction per level
 */
export type PlatformLayout = "island" | "split-island" | "side" | "stacked";

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
    // A split island's revenue tracks are still the outer pair with the
    // platforms inboard of them, so a train sees its platform on the same
    // side as it would at an ordinary island. Only the centre track differs,
    // and nothing revenue-carrying stops at it.
    case "split-island":
      return "right";
    case "side":
      return "left";
    case "stacked":
      return null;
  }
}

/**
 * Whether one surveyed feature serves both directions at this station.
 *
 * On an island platform the escalator, the stairs and the lift stand on the
 * one platform between the two tracks, so a surveyor on either face is
 * describing the same physical thing. Recording it twice is wasted effort at
 * best; at worst the two rows drift apart and the app contradicts itself.
 * Side and stacked platforms are genuinely separate places, and what is on one
 * says nothing about the other.
 *
 * This is about the platform, NOT about door numbering. A doorIndex is stored
 * from the low-code end and is already direction-independent, so the shared
 * feature keeps the same doorIndex both ways — toCarPosition() is what turns
 * it into the car and door a commuter sees, and that differs per direction on
 * its own. Mirroring the stored index as well would move the feature to the
 * far end of the platform.
 */
export function servesBothDirections(layout: PlatformLayout | null): boolean {
  // Deliberately not "split-island". Paya Lebar's Circle Line platforms are
  // islands by shape and the infobox counts them as such, but a third track
  // runs between them for terminating trains — so the two directions stand on
  // two different platforms, and an escalator on one is not on the other.
  // Treating them as one wrote four features onto platforms that never had
  // them, and every one of them looked like a field survey.
  return layout === "island";
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
  if (!["island", "split-island", "side", "stacked"].includes(input.layout as string)) {
    errors.push('layout must be "island", "split-island", "side" or "stacked"');
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
