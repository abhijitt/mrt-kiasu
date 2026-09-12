/**
 * The clock this app runs on.
 *
 * Singapore is the only network it covers, so "now" means now in Singapore —
 * not now on whatever machine happens to be rendering. Both ends of that were
 * wrong before: the server renders on Vercel in UTC, so a journey worked out
 * server-side came back eight hours adrift and only corrected once the browser
 * hydrated; and the browser used the visitor's own timezone, so a tourist whose
 * phone was still on London time got a journey priced against the wrong service
 * window entirely.
 *
 * Deliberately free of data imports, so client components can use it without
 * dragging a dataset into the browser bundle.
 */

const TIME_ZONE = "Asia/Singapore";

/**
 * en-CA because it formats dates as YYYY-MM-DD, and h23 because some locales
 * render midnight as "24:00", which would put the first minute of the day
 * 1,440 minutes out.
 */
const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(date: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

/** The Singapore calendar date, as YYYY-MM-DD. */
export function sgIsoDate(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since Singapore midnight, 0..1439 — the shape the timetable uses. */
export function sgMinutesOfDay(date: Date = new Date()): number {
  const p = parts(date);
  return Number(p.hour) * 60 + Number(p.minute);
}

/**
 * Day of the week in Singapore, 0 = Sunday, matching Date#getDay.
 *
 * Built from the Singapore calendar date at UTC midnight rather than read off
 * the Date directly, so it reports the Singapore day wherever this runs.
 */
export function sgDayOfWeek(date: Date = new Date()): number {
  return new Date(`${sgIsoDate(date)}T00:00:00Z`).getUTCDay();
}
