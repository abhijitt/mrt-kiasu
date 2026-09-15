import "server-only";
import { LINES, doorsPerTrain, type LineCode } from "./lines";
import { STATIONS, getStation } from "./stations";
import { platformDirections } from "./network";
import { layoutFor, servesBothDirections, type PlatformLayout } from "./orientation";
import { platformKey } from "./positions";
import { sameFeature, type PlatformFeature } from "./feature-types";
import positionsData from "@/data/positions.json";

/**
 * The plan of a station: what its platforms are, and what stands on them.
 *
 * Deliberately NOT direction-relative, unlike the platform diagram. That one
 * answers "which door do I stand at going this way" and must face the way the
 * reader's train faces. This answers "what is this station shaped like", which
 * has one answer however you arrived — so it is drawn from the low-code end of
 * the line to the high-code end, with the neighbouring stations naming both
 * ends, and a reader orients themselves by those rather than by a direction we
 * would have to pick for them.
 *
 * Surveyed features only. An estimate is a guess about where an exit surfaces,
 * and drawing guesses onto a floor plan would make the plan look like a survey.
 */

const surveyed = positionsData.platforms as Record<string, PlatformFeature[]>;

/**
 * One physical thing, and the doors it is best reached from.
 *
 * Usually one door. Two when a lift's door faces one side of an island
 * platform, so whichever way you arrived you walk to the same lift but not
 * from the same door. Both are kept: dropping one would silently tell half of
 * all readers the wrong door, and duplicating the thing would tell them the
 * station has two lifts.
 */
export interface LayoutFeature {
  feature: PlatformFeature;
  doors: number[];
}

export interface LayoutPlatform {
  /** Both, when one platform serves both directions. */
  directions: ("asc" | "desc")[];
  /** Where a train leaving from this platform goes next. */
  towards: string[];
  features: LayoutFeature[];
}

export interface LayoutBlock {
  code: string;
  line: LineCode;
  colorVar: string;
  layout: PlatformLayout | null;
  layoutSourceNote: string | null;
  totalDoors: number | null;
  platforms: LayoutPlatform[];
  /** Neighbouring stations at the low- and high-code ends of the platform. */
  ends: { low: string | null; high: string | null };
  surveyedPlatforms: number;
}

/**
 * The plan for this code's platforms, and only this code's.
 *
 * An interchange page used to draw every line at the station at once, which
 * read as one enormous station rather than as the line you are standing on.
 * The other lines are one tap away from the interchange list instead.
 */
export function stationLayout(code: string): LayoutBlock | null {
  const here = getStation(code);
  return here ? block(here.code) : null;
}

function block(code: string): LayoutBlock | null {
  const station = STATIONS.find((s) => s.code === code.toUpperCase());
  if (!station) return null;

  const dirs = platformDirections(station.code);
  const layout = layoutFor(station.code)?.layout ?? null;
  const shared = servesBothDirections(layout);

  const featuresFor = (d: "asc" | "desc") =>
    [...(surveyed[platformKey(station.code, d)] ?? [])].sort(
      (a, b) => a.doorIndex - b.doorIndex,
    );

  let platforms: LayoutPlatform[];
  if (shared) {
    // One platform between the tracks: the two directions describe the same
    // concrete, so the same escalator must not be drawn twice.
    const merged: LayoutFeature[] = [];
    for (const f of [...featuresFor("asc"), ...featuresFor("desc")]) {
      const already = merged.find((m) => sameFeature(m.feature, f));
      if (!already) merged.push({ feature: f, doors: [f.doorIndex] });
      else if (!already.doors.includes(f.doorIndex)) already.doors.push(f.doorIndex);
    }
    for (const m of merged) m.doors.sort((a, b) => a - b);
    platforms = [
      {
        directions: dirs.map((d) => d.direction),
        towards: dirs.map((d) => d.nextStop.name),
        features: merged.sort((a, b) => a.doors[0] - b.doors[0]),
      },
    ];
  } else {
    // Drawn low-code platform first, so the picture matches the end labels.
    platforms = [...dirs]
      .sort((a) => (a.direction === "desc" ? -1 : 1))
      .map((d) => ({
        directions: [d.direction],
        towards: [d.nextStop.name],
        features: featuresFor(d.direction).map((f) => ({ feature: f, doors: [f.doorIndex] })),
      }));
  }

  return {
    code: station.code,
    line: station.line,
    colorVar: LINES[station.line].colorVar,
    layout,
    layoutSourceNote: layoutFor(station.code)?.sourceNote ?? null,
    totalDoors: doorsPerTrain(station.line),
    platforms,
    ends: {
      low: dirs.find((d) => d.direction === "desc")?.nextStop.name ?? null,
      high: dirs.find((d) => d.direction === "asc")?.nextStop.name ?? null,
    },
    surveyedPlatforms: (["asc", "desc"] as const).filter(
      (d) => (surveyed[platformKey(station.code, d)] ?? []).length > 0,
    ).length,
  };
}
