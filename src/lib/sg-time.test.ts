import { describe, expect, it } from "vitest";
import { sgDayOfWeek, sgIsoDate, sgMinutesOfDay } from "./sg-time";
import { serviceDayOf } from "./service-status";
import { dayNameOf, isoDateOf } from "./service-adjustments";

/**
 * The app covers one city, so "now" means now in Singapore.
 *
 * These pin the property that actually broke: the answer must not depend on
 * where the code runs. The server renders on Vercel in UTC and the browser
 * runs in whatever timezone the visitor's phone is set to, and both were
 * previously reading their own local clock.
 */

// 2026-09-13T15:59:00Z is 2026-09-13 23:59 in Singapore (UTC+8).
const LATE_EVENING = new Date("2026-09-13T15:59:00Z");
// Half an hour later it is the 14th in Singapore but still the 13th in UTC.
const JUST_PAST_MIDNIGHT = new Date("2026-09-13T16:30:00Z");

describe("the Singapore clock", () => {
  it("reads the hour in Singapore, not in UTC", () => {
    expect(sgMinutesOfDay(LATE_EVENING)).toBe(23 * 60 + 59);
  });

  it("rolls the date over at Singapore midnight, not UTC midnight", () => {
    expect(sgIsoDate(LATE_EVENING)).toBe("2026-09-13");
    expect(sgIsoDate(JUST_PAST_MIDNIGHT)).toBe("2026-09-14");
    expect(sgMinutesOfDay(JUST_PAST_MIDNIGHT)).toBe(30);
  });

  it("never returns a minute outside the day", () => {
    // Midnight is the trap: some locales format it as 24:00, which would put
    // the first minute of the day 1,440 minutes out.
    for (let hour = 0; hour < 24; hour++) {
      const at = new Date(Date.UTC(2026, 8, 13, (hour + 16) % 24, 0));
      const minutes = sgMinutesOfDay(at);
      expect(minutes).toBeGreaterThanOrEqual(0);
      expect(minutes).toBeLessThan(24 * 60);
    }
  });

  it("names the Singapore weekday", () => {
    // 13 Sep 2026 is a Sunday; 14 Sep is a Monday.
    expect(sgDayOfWeek(LATE_EVENING)).toBe(0);
    expect(sgDayOfWeek(JUST_PAST_MIDNIGHT)).toBe(1);
  });
});

describe("the callers follow the same clock", () => {
  it("picks the timetable by the Singapore day", () => {
    // Still Sunday in Singapore at 23:59, though UTC has been Sunday all along.
    expect(serviceDayOf(LATE_EVENING)).toBe("sunday");
    // Monday in Singapore while UTC still says Sunday — the case that decides
    // whether a commuter gets the weekday timetable or the weekend one.
    expect(serviceDayOf(JUST_PAST_MIDNIGHT)).toBe("weekday");
  });

  it("dates a service adjustment by the Singapore day", () => {
    expect(dayNameOf(JUST_PAST_MIDNIGHT)).toBe("monday");
    expect(isoDateOf(JUST_PAST_MIDNIGHT)).toBe("2026-09-14");
  });
});
