/**
 * Landmarks near each station's exits.
 *
 * There is no official "which exit for which landmark" dataset — LTA publishes
 * exit codes and coordinates only. Landmark positions and exit positions are
 * both real data, so the pairing is COMPUTED rather than asserted: each named
 * OpenStreetMap place within walking distance is matched to its nearest exit.
 *
 * Stored per station and deduplicated, so the budget goes on distinct places
 * rather than repeating the same mall under every exit.
 */

import landmarkData from "@/data/landmarks.json";

export type { Landmark } from "./landmark-types";
export { groupByExit } from "./landmark-types";

import type { Landmark } from "./landmark-types";

const BY_STATION = landmarkData.stations as Record<string, Landmark[]>;

/** Landmarks for a station, nearest first. */
export function landmarksFor(stationCode: string): Landmark[] {
  return BY_STATION[stationCode.toUpperCase()] ?? [];
}

/**
 * Merges the landmarks of every platform code at one physical station, so an
 * interchange shows all of them rather than one line's.
 */
export function landmarksForCodes(codes: string[]): Landmark[] {
  const seen = new Map<string, Landmark>();
  for (const code of codes) {
    for (const l of landmarksFor(code)) {
      const key = `${l.name}|${l.kind}`;
      const existing = seen.get(key);
      if (!existing || l.metres < existing.metres) seen.set(key, l);
    }
  }
  return [...seen.values()].sort((a, b) => a.metres - b.metres);
}

