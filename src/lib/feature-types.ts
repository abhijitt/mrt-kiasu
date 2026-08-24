/**
 * Types and pure helpers for platform features.
 *
 * Deliberately separate from positions.ts, which imports the ~430 KB estimates
 * dataset. Client components need the types and the filtering rules but must
 * never pull the data — importing a single helper from a module that also
 * imports JSON drags the whole file into the browser bundle.
 */

/**
 * "exit" is what an estimate can honestly claim: it locates where an exit
 * surfaces, without knowing whether an escalator, lift or stairs serves it.
 */
export type FeatureType = "escalator" | "lift" | "stairs" | "transfer" | "exit";
export type SourceKind = "survey" | "osm" | "official-map" | "user" | "estimate";
export type Confidence = "verified" | "candidate" | "estimate";

/**
 * Which way an escalator runs.
 *
 * An escalator that only goes DOWN is worse than useless to someone getting
 * off a train, and sending them to one would be actively wrong. Stairs and
 * lifts serve both directions inherently, so this only applies to escalators.
 * "reversible" covers the ones that switch with the peak direction.
 */
export type Travel = "up" | "down" | "reversible";

export interface PlatformFeature {
  type: FeatureType;
  doorIndex: number;
  leadsTo: string[];
  source: SourceKind;
  confidence: Confidence;
  verifiedAt?: string;
  sourceNote: string;
  /** Escalators only: which way it runs. */
  travel?: Travel;
  /** Metres along the platform from its centre; estimates only. */
  offsetM?: number;
}

/** Usable by someone alighting and heading for the exit. */
export function servesAlighting(f: PlatformFeature): boolean {
  if (f.type !== "escalator") return true;
  // Unrecorded direction is treated as usable but is worth re-surveying;
  // only a known down-only escalator is excluded.
  return f.travel !== "down";
}

/**
 * Picks what to show for "get me to the way out", from an already-loaded list.
 *
 * Honours the escalator/lift/stairs preference when a survey recorded it, and
 * otherwise falls back to the exit-position estimate. Callers can tell which
 * happened from the returned feature's `type`.
 */
export function chooseExitFeature(
  features: PlatformFeature[],
  preference: FeatureType,
  exitCode?: string | null,
): PlatformFeature | null {
  const matchesExit = (f: PlatformFeature) =>
    !exitCode || f.leadsTo.some((t) => t.toUpperCase() === exitCode.toUpperCase());

  return (
    features.find((f) => f.type === preference && matchesExit(f) && servesAlighting(f)) ??
    features.find(
      (f) =>
        f.confidence !== "estimate" &&
        f.type !== "transfer" &&
        matchesExit(f) &&
        servesAlighting(f),
    ) ??
    features.find((f) => f.type === "exit" && matchesExit(f)) ??
    null
  );
}
