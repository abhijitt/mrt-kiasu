import "server-only";
import volumesData from "@/data/volumes.json";

/**
 * How many people tap in and out at a station on an average day.
 *
 * Server-only. The whole network is 34 KB for a page that needs one station's
 * four numbers, and the station page renders on the server anyway.
 *
 * Both directions are kept even though only one is shown. They are separate
 * facts — Dhoby Ghaut takes 33,966 in and 31,291 out on a weekday, and Fort
 * Canning the other way round — and storing one would mean a re-import to
 * change the sentence.
 */

export interface StationVolume {
  /** Journeys started here on an average day of this kind. */
  in: number;
  /** Journeys ended here. */
  out: number;
}

export interface Volumes {
  weekday: StationVolume;
  weekend: StationVolume;
}

const STATIONS = volumesData.stations as Record<string, Volumes>;

/** The month these figures cover, e.g. "2026-08". */
export const VOLUME_MONTH: string = volumesData._source.month;

export function volumesFor(stationCode: string): Volumes | null {
  return STATIONS[stationCode.toUpperCase()] ?? null;
}

/**
 * The figure to put in front of someone, rounded to how well it is known.
 *
 * A monthly average presented to the person is not 47,813 accurate — it is
 * one month's mean, and next month's will differ by more than the last three
 * digits. Rounding to two significant figures says that: 48,000 rather than a
 * precision the number does not have.
 *
 * Under 1,000 it rounds to the nearest hundred instead. Two significant
 * figures would turn a genuinely small station into "1,000" and lose the one
 * thing that figure is for.
 */
export function roundedVolume(n: number): number {
  if (n < 1000) return Math.round(n / 100) * 100;
  const scale = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / scale) * scale;
}
