/**
 * Platform feature positions and their provenance.
 *
 * Three tiers of trust, and the UI never blurs them:
 *
 *   verified  — someone stood on the platform and checked. Shown as car + door.
 *   candidate — derived from OSM platform-level geometry, not yet checked.
 *   estimate  — derived from exit coordinates projected onto the line bearing.
 *               Precision is roughly +/- 30 m, so these are presented at CAR
 *               level only. Claiming a specific door here would imply an
 *               accuracy the method does not have.
 *
 * Surveyed data always wins over an estimate for the same feature.
 */

import estimatesData from "@/data/estimates.json";
import positionsData from "@/data/positions.json";
import { doorsPerTrain, type LineCode } from "./lines";
import type { Direction } from "./doors";
import {
  chooseFeature,
  type Confidence,
  type FeatureType,
  type PlatformFeature,
  type SourceKind,
} from "./feature-types";

export type {
  Confidence,
  FeatureType,
  PlatformFeature,
  SourceKind,
  Travel,
} from "./feature-types";
export { chooseFeature, leadsToTarget, servesAlighting, DEVICE_TYPES } from "./feature-types";

const surveyed = positionsData.platforms as Record<string, PlatformFeature[]>;
const estimated = estimatesData.platforms as unknown as Record<string, PlatformFeature[]>;

const RANK: Record<Confidence, number> = { verified: 0, candidate: 1, estimate: 2 };

export function platformKey(stationCode: string, direction: Direction): string {
  return `${stationCode.toUpperCase()}:${direction}`;
}

/**
 * Features for a platform, surveyed data first.
 *
 * An estimate is dropped when a surveyed entry already covers the same feature
 * and destination, so a checked position is never shown alongside a guess at
 * the same thing.
 */
export function getFeatures(
  stationCode: string,
  direction: Direction,
): PlatformFeature[] {
  const key = platformKey(stationCode, direction);
  const real = surveyed[key] ?? [];
  const guesses = estimated[key] ?? [];

  const covered = new Set(
    real.map((f) => `${f.type}|${[...f.leadsTo].sort().join(",")}`),
  );
  const merged = [
    ...real,
    ...guesses.filter(
      (g) => !covered.has(`${g.type}|${[...g.leadsTo].sort().join(",")}`),
    ),
  ];

  return merged.sort(
    (a, b) => RANK[a.confidence] - RANK[b.confidence] || a.doorIndex - b.doorIndex,
  );
}

/** True when a person has actually checked something on this platform. */
export function hasVerifiedData(stationCode: string, direction: Direction): boolean {
  return (surveyed[platformKey(stationCode, direction)] ?? []).length > 0;
}

/**
 * Picks what to show for "get me to the thing I am heading for".
 *
 * `target` is an exit code when alighting and the next line's code at an
 * interchange. See chooseFeature for the fallback order.
 */
export function findExitGuidance(
  stationCode: string,
  direction: Direction,
  preference: FeatureType,
  target?: string,
): PlatformFeature | null {
  return chooseFeature(getFeatures(stationCode, direction), preference, target);
}

/** All exits with an estimated position on this platform. */
export function exitFeatures(
  stationCode: string,
  direction: Direction,
): PlatformFeature[] {
  return getFeatures(stationCode, direction).filter((f) => f.leadsTo.length > 0);
}

export function coverageStats(): {
  verifiedPlatforms: number;
  verifiedFeatures: number;
  estimatedPlatforms: number;
  estimatedFeatures: number;
} {
  const real = Object.values(surveyed);
  const guesses = Object.values(estimated);
  return {
    verifiedPlatforms: real.length,
    verifiedFeatures: real.flat().filter((f) => f.confidence === "verified").length,
    estimatedPlatforms: guesses.length,
    estimatedFeatures: guesses.flat().length,
  };
}

export function validateFeature(
  feature: Partial<PlatformFeature>,
  line: LineCode,
): string[] {
  const errors: string[] = [];
  const total = doorsPerTrain(line);

  if (total === null) {
    return [`No sourced train geometry for ${line} — cannot validate door positions`];
  }

  const validTypes: FeatureType[] = ["escalator", "lift", "stairs", "exit"];
  const validSources: SourceKind[] = ["survey", "osm", "official-map", "user", "estimate"];
  const validConfidence: Confidence[] = ["verified", "candidate", "estimate"];
  const validTravel = ["up", "down", "reversible"];

  if (feature.travel !== undefined && !validTravel.includes(feature.travel)) {
    errors.push(`travel must be one of ${validTravel.join(", ")}`);
  }
  if (feature.type === "escalator" && feature.confidence === "verified" && !feature.travel) {
    errors.push(
      "travel is required for a surveyed escalator — a down-only escalator is " +
        "useless to someone alighting",
    );
  }

  if (!feature.type || !validTypes.includes(feature.type)) {
    errors.push(`type must be one of ${validTypes.join(", ")}`);
  }
  if (
    typeof feature.doorIndex !== "number" ||
    !Number.isInteger(feature.doorIndex) ||
    feature.doorIndex < 1 ||
    feature.doorIndex > total
  ) {
    errors.push(`doorIndex must be an integer in 1..${total} for a ${line} train`);
  }
  if (!feature.source || !validSources.includes(feature.source)) {
    errors.push(`source is required and must be one of ${validSources.join(", ")}`);
  }
  if (!feature.confidence || !validConfidence.includes(feature.confidence)) {
    errors.push(`confidence is required and must be one of ${validConfidence.join(", ")}`);
  }
  if (!feature.sourceNote || feature.sourceNote.trim() === "") {
    errors.push("sourceNote is required — every position must say where it came from");
  }
  if (feature.confidence === "verified" && !feature.verifiedAt) {
    errors.push("verifiedAt is required when confidence is 'verified'");
  }
  if (!Array.isArray(feature.leadsTo)) {
    errors.push("leadsTo must be an array (use [] if it leads nowhere specific)");
  }

  return errors;
}
