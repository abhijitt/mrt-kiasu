import "server-only";
import { hasTrainGeometry, type LineCode } from "./lines";
import { STATIONS } from "./stations";
import { platformKey } from "./positions";
import type { PlatformFeature } from "./feature-types";
import positionsData from "@/data/positions.json";

/**
 * How much of the network a person has actually stood on and checked.
 *
 * "Surveyed" is not one thing, and reporting it as one number hid the gap that
 * matters. A platform with a single escalator recorded is not mapped: the app
 * can answer "where is an escalator" and still have nothing to say to someone
 * heading for Exit D or changing to the Circle Line, which is most of what it
 * is asked. So a platform counts as COMPLETE only when every exit at that
 * station and every line you can change to there is reachable through some
 * recorded feature.
 *
 * Platforms on lines with no sourced fleet data are left out of the count
 * entirely rather than sitting permanently at zero. Nobody can survey a door
 * position for a train whose door count we do not know, so counting those as
 * outstanding work would make the figure unreachable by construction and
 * quietly wrong forever.
 */

const surveyed = positionsData.platforms as Record<string, PlatformFeature[]>;

export interface PlatformCoverage {
  code: string;
  direction: "asc" | "desc";
  features: number;
  exitsCovered: number;
  exitsTotal: number;
  transfersCovered: number;
  transfersTotal: number;
  /** Something is recorded here. */
  started: boolean;
  /**
   * Whether anyone has actually stood on this platform.
   *
   * An island platform's far face is filled in from the near one, which is
   * enough to route someone and is why the meter can read 100% there. It is
   * not a survey, and the difference matters: Aljunied's lift faces one side,
   * so its best door genuinely differs by direction and the inference had it
   * a door out. A platform with only inferred records is still worth a visit.
   */
  surveyedHere: boolean;
  /** Every exit and every transfer at this station can be reached. */
  complete: boolean;
}

export interface SurveyCoverage {
  platforms: { total: number; started: number; complete: number };
  stations: { total: number; started: number; complete: number };
  /** Stations where every platform is complete, newest first in code order. */
  completeStations: string[];
  /** Platforms that are started but not complete, worst gap first. */
  inProgress: PlatformCoverage[];
  /** Platforms excluded because their line has no sourced train geometry. */
  notSurveyable: number;
  /**
   * The lines those platforms are on.
   *
   * Derived rather than written down. "84 platforms are left out" reads as an
   * apology for a gap in the survey, when it is nothing of the kind: no
   * published source gives an LRT train's length, so there is no door to point
   * at and never was. Naming the lines says which stations are affected, and
   * deriving the names means the sentence cannot go stale if a line gains
   * fleet data or a new one arrives without it.
   */
  notSurveyableLines: LineCode[];
}

function coverageFor(code: string, direction: "asc" | "desc"): PlatformCoverage {
  const station = STATIONS.find((s) => s.code === code)!;
  const features = surveyed[platformKey(code, direction)] ?? [];
  const reached = new Set(features.flatMap((f) => f.leadsTo.map((t) => t.toUpperCase())));

  const exits = station.exits.map((e) => e.code.toUpperCase());
  const transfers = station.interchanges.map((i) => i.line.toUpperCase());
  const exitsCovered = exits.filter((e) => reached.has(e)).length;
  const transfersCovered = transfers.filter((l) => reached.has(l)).length;

  return {
    code,
    direction,
    features: features.length,
    exitsCovered,
    exitsTotal: exits.length,
    transfersCovered,
    transfersTotal: transfers.length,
    started: features.length > 0,
    surveyedHere: features.some((f) => !f.impliedFrom),
    // An exit-less station cannot fail the exit test, which is right: there is
    // nothing there to point anyone at.
    complete:
      features.length > 0 &&
      exitsCovered === exits.length &&
      transfersCovered === transfers.length,
  };
}

export function surveyCoverage(): SurveyCoverage {
  const rows: PlatformCoverage[] = [];
  let notSurveyable = 0;
  const excludedLines = new Set<LineCode>();

  for (const station of STATIONS) {
    for (const direction of ["asc", "desc"] as const) {
      if (!hasTrainGeometry(station.line)) {
        notSurveyable++;
        excludedLines.add(station.line);
        continue;
      }
      rows.push(coverageFor(station.code, direction));
    }
  }

  const byStation = new Map<string, PlatformCoverage[]>();
  for (const r of rows) byStation.set(r.code, [...(byStation.get(r.code) ?? []), r]);

  const stationsComplete = [...byStation.entries()]
    .filter(([, ps]) => ps.length > 0 && ps.every((p) => p.complete))
    .map(([code]) => code);

  return {
    platforms: {
      total: rows.length,
      started: rows.filter((r) => r.started).length,
      complete: rows.filter((r) => r.complete).length,
    },
    stations: {
      total: byStation.size,
      started: [...byStation.values()].filter((ps) => ps.some((p) => p.started)).length,
      complete: stationsComplete.length,
    },
    completeStations: stationsComplete.sort(),
    // Sorted by how much is still missing, so the list reads as a to-do.
    inProgress: rows
      .filter((r) => r.started && !r.complete)
      .sort(
        (a, b) =>
          b.exitsTotal - b.exitsCovered + (b.transfersTotal - b.transfersCovered) -
          (a.exitsTotal - a.exitsCovered + (a.transfersTotal - a.transfersCovered)),
      ),
    notSurveyable,
    notSurveyableLines: [...excludedLines],
  };
}

/** This station's platforms, for the indicator on its own page. */
export function stationCoverage(code: string): PlatformCoverage[] {
  const station = STATIONS.find((s) => s.code === code.toUpperCase());
  if (!station || !hasTrainGeometry(station.line)) return [];
  return (["asc", "desc"] as const).map((d) => coverageFor(station.code, d));
}
