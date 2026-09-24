import "server-only";
import positions from "@/data/positions.json";
import stations from "@/data/stations.json";
import exits from "@/data/exits.json";
import landmarks from "@/data/landmarks.json";
import estimates from "@/data/estimates.json";
import trivia from "@/data/trivia.json";
import triviaTranslated from "@/data/trivia.translated.json";
import trainTimes from "@/data/train-times.json";
import volumes from "@/data/volumes.json";
import holidays from "@/data/holidays.json";
import { getStation } from "./stations";

/**
 * When a page's content last changed, for the sitemap.
 *
 * The sitemap used to stamp every entry with the build time, so every deploy
 * claimed all 230 pages had changed. Crawlers learn that such a field means
 * nothing and stop reading it — which throws away the one thing it is for:
 * getting a station re-crawled soon after someone surveys it.
 *
 * A station page is built from two kinds of data. Network-wide imports feed
 * every station at once, and when one lands every page genuinely did change.
 * Surveys feed one station. The page's date is the later of the two, so a
 * survey at Stevens moves Stevens and nothing else.
 */

/** Newest ISO date in a list, ignoring the missing. */
function latest(dates: (string | undefined | null)[]): string | undefined {
  return dates.filter((d): d is string => typeof d === "string" && d.length >= 10).sort().at(-1);
}

type Sourced = { _source?: Record<string, unknown> };
const stamp = (d: unknown, ...keys: string[]) => {
  const src = (d as Sourced)._source ?? {};
  return latest(keys.map((k) => (typeof src[k] === "string" ? (src[k] as string) : undefined)));
};

/** The last import that feeds every station page. */
const NETWORK = latest([
  stamp(stations, "importedAt"),
  stamp(exits, "importedAt"),
  stamp(landmarks, "importedAt"),
  stamp(estimates, "generatedAt"),
  stamp(trivia, "importedAt"),
  stamp(triviaTranslated, "generatedAt"),
  stamp(trainTimes, "importedAt"),
  stamp(volumes, "retrieved"),
  // Holidays change which timetable a station shows on a given day.
  stamp(holidays, "retrieved"),
]);

type Dated = { verifiedAt?: string };
const PLATFORMS = positions.platforms as Record<string, Dated[]>;
const LAYOUTS = positions.layouts as Record<string, Dated>;
const ORIENTATION = positions.orientation as Record<string, Dated>;

/** The newest survey, layout or door-side record at one station code. */
function surveyedAt(code: string): string | undefined {
  return latest([
    ...["asc", "desc"].flatMap((d) => (PLATFORMS[`${code}:${d}`] ?? []).map((f) => f.verifiedAt)),
    LAYOUTS[code]?.verifiedAt,
    ORIENTATION[`${code}:asc`]?.verifiedAt,
    ORIENTATION[`${code}:desc`]?.verifiedAt,
  ]);
}

/**
 * A station page's date. Every code at the station counts: the page listed in
 * search stands for the whole interchange, and a survey on the Circle Line
 * platforms at Paya Lebar is news about Paya Lebar.
 */
export function stationModified(code: string): Date | undefined {
  const station = getStation(code);
  if (!station) return undefined;
  const codes = [station.code, ...station.interchanges.map((i) => i.code)];
  const date = latest([NETWORK, ...codes.map(surveyedAt)]);
  // Midnight UTC, so the date printed is the date recorded. Singapore
  // midnight is 16:00 the day before in UTC, and the sitemap prints UTC.
  return date ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : undefined;
}

/** The newest of several pages' dates — for a line, or a route's two ends. */
export function newestOf(dates: (Date | undefined)[]): Date | undefined {
  const known = dates.filter((d): d is Date => d !== undefined);
  return known.length ? new Date(Math.max(...known.map((d) => d.getTime()))) : undefined;
}
