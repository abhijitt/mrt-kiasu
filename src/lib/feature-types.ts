/**
 * Types and pure helpers for platform features.
 *
 * Deliberately separate from positions.ts, which imports the ~430 KB estimates
 * dataset. Client components need the types and the filtering rules but must
 * never pull the data — importing a single helper from a module that also
 * imports JSON drags the whole file into the browser bundle.
 */

/**
 * What a feature physically IS — never what it is for.
 *
 * There used to be a "transfer" member here, which conflated the device with
 * its destination. A surveyor standing at the escalator into the Circle Line
 * corridor had to choose between recording that it was an escalator and
 * recording where it led, and either choice lost something real: picking
 * "transfer" threw away the fact that a lift-preferring commuter should be
 * warned, and picking "escalator" left no way to say where it went.
 *
 * Where a feature leads is now `leadsTo` alone, carrying exit codes and line
 * codes side by side, so one escalator can serve both and a preference
 * survives a transfer.
 *
 * "exit" is the exception, and it is not a device: it is what an estimate can
 * honestly claim — where an exit surfaces, without knowing what serves it.
 */
export type FeatureType = "escalator" | "lift" | "stairs" | "exit";

/**
 * The types a commuter can express a preference between.
 *
 * "exit" is excluded because nobody prefers one: it is the fallback we show
 * when no device has been surveyed.
 */
export const DEVICE_TYPES = ["escalator", "lift", "stairs"] as const satisfies readonly FeatureType[];

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
  /**
   * Where this leads: exit codes as printed on station signage ("C"), line
   * codes for a transfer corridor ("CCL"), or both. One axis, so an escalator
   * that serves Exit C and the Circle Line says so in one row.
   */
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

/** Case-insensitive: `target` is an exit code or a line code, indifferently. */
export function leadsToTarget(f: PlatformFeature, target: string): boolean {
  return f.leadsTo.some((t) => t.toUpperCase() === target.toUpperCase());
}

/**
 * Picks what to show for "get me to the thing I am heading for".
 *
 * `target` is an exit code on the last leg and the next leg's line code at an
 * interchange — the same lookup either way, because the data no longer draws a
 * distinction between an escalator that leads out and one that leads across.
 *
 * Honours the escalator/lift/stairs preference where a survey recorded one,
 * then any surveyed device, then the exit-position estimate. Callers can tell
 * which happened from the returned feature's `type` and `confidence`, and the
 * UI says so rather than implying the preference was applied.
 */
export function chooseFeature(
  features: PlatformFeature[],
  preference: FeatureType,
  target?: string | null,
): PlatformFeature | null {
  const matches = (f: PlatformFeature) => !target || leadsToTarget(f, target);

  return (
    features.find((f) => f.type === preference && matches(f) && servesAlighting(f)) ??
    features.find((f) => f.confidence !== "estimate" && matches(f) && servesAlighting(f)) ??
    features.find((f) => f.type === "exit" && matches(f)) ??
    null
  );
}
