import { describe, expect, it } from "vitest";
import {
  LAST_TRAIN_WARNING_MINUTES,
  connectionAtRisk,
  holidayOn,
  holidaysCover,
  serviceDayOf,
  statusFor,
  type TrainTime,
  worstStatus,
  serviceDate,
} from "./service-status";
import { sgDayOfWeek } from "./sg-time";

/** Bishan towards Marina South Pier, weekday: real values from the feed. */
const ROW: TrainTime = {
  towards: "Marina South Pier",
  first: "06:09",
  last: "23:40",
};
/** A direction whose last train is after midnight, which is the tricky case. */
const LATE: TrainTime = { towards: "Clockwise", first: "05:42", last: "00:37" };

const at = (h: number, m = 0) => h * 60 + m;

describe("service day", () => {
  it("maps weekdays, Saturday and Sunday", () => {
    expect(serviceDayOf(new Date("2026-08-26T10:00:00"))).toBe("weekday"); // Wed
    expect(serviceDayOf(new Date("2026-08-29T10:00:00"))).toBe("saturday");
    expect(serviceDayOf(new Date("2026-08-30T10:00:00"))).toBe("sunday");
  });
});

describe("status through the day", () => {
  it("is running in the middle of the day", () => {
    expect(statusFor(ROW, at(14)).kind).toBe("running");
  });

  it("warns before the first train", () => {
    const s = statusFor(ROW, at(5, 30));
    expect(s.kind).toBe("beforeFirst");
    if (s.kind === "beforeFirst") expect(s.minutesUntil).toBe(39);
  });

  it("warns as the last train approaches", () => {
    const s = statusFor(ROW, at(23, 10));
    expect(s.kind).toBe("lastSoon");
    if (s.kind === "lastSoon") expect(s.minutesLeft).toBe(30);
  });

  it("says the last train has gone", () => {
    expect(statusFor(ROW, at(23, 55)).kind).toBe("afterLast");
  });

  it("does not warn while the last train is still far off", () => {
    expect(
      statusFor(ROW, at(23, 40 - LAST_TRAIN_WARNING_MINUTES - 5)).kind,
    ).toBe("running");
  });
});

describe("services that run past midnight", () => {
  it("measures the gap to a 00:37 last train across midnight", () => {
    // The trap: naive arithmetic makes 00:37 look 23 hours away at 23:50, so
    // the app would cheerfully report trains running all night. 47 minutes is
    // just outside the warning window, which is the point — the distance is
    // computed correctly rather than the warning firing by luck.
    const s = statusFor(LATE, at(23, 50));
    expect(s.kind).toBe("running");
    expect(statusFor(LATE, at(23, 50), 60).kind).toBe("lastSoon");
  });

  it("warns once the wrapped last train is genuinely close", () => {
    const s = statusFor(LATE, at(23, 57));
    expect(s.kind).toBe("lastSoon");
    if (s.kind === "lastSoon") expect(s.minutesLeft).toBe(40);
  });

  it("is still running just after midnight", () => {
    expect(statusFor(LATE, at(0, 20)).kind).toBe("lastSoon");
  });

  it("knows the last train has gone at 01:00", () => {
    expect(statusFor(LATE, at(1, 0)).kind).toBe("afterLast");
  });

  it("switches to waiting for the first train in the small hours", () => {
    const s = statusFor(LATE, at(4, 0));
    expect(s.kind).toBe("beforeFirst");
  });
});

describe("worst status", () => {
  it("reports the most urgent of several directions", () => {
    expect(
      worstStatus([
        { kind: "running" },
        { kind: "lastSoon", last: "23:40", minutesLeft: 10 },
      ]).kind,
    ).toBe("lastSoon");
    expect(
      worstStatus([
        { kind: "lastSoon", last: "23:40", minutesLeft: 10 },
        { kind: "afterLast", last: "23:20" },
      ]).kind,
    ).toBe("afterLast");
  });

  it("is running when everything is running", () => {
    expect(worstStatus([{ kind: "running" }, { kind: "running" }]).kind).toBe(
      "running",
    );
  });
});

describe("connections", () => {
  it("flags a connection you cannot reach in time", () => {
    // Last connecting train 23:40; it is 23:20 and the first leg takes 30 min.
    expect(connectionAtRisk(ROW, at(23, 20), 30)).toBe(true);
  });

  it("accepts a connection with time to spare", () => {
    expect(connectionAtRisk(ROW, at(22, 0), 30)).toBe(false);
  });

  it("flags a connection whose last train has already gone", () => {
    expect(connectionAtRisk(ROW, at(23, 55), 5)).toBe(true);
  });

  it("handles a connection running past midnight", () => {
    expect(connectionAtRisk(LATE, at(23, 50), 20)).toBe(false);
    expect(connectionAtRisk(LATE, at(23, 50), 60)).toBe(true);
  });
});

/**
 * The timetable on a public holiday is Sunday's, whatever weekday it is.
 *
 * Until MOM's list was imported the app could not tell a holiday Monday from
 * an ordinary one. That was harmless while all three timetables were on
 * screen for the reader to pick from; once the station page showed only
 * today's, it would have shown the weekday times on the eleven days a year
 * when they are wrong.
 */
describe("public holidays run a Sunday timetable", () => {
  const sg = (iso: string) => new Date(`${iso}T04:00:00Z`); // noon in Singapore

  it("treats a holiday weekday as Sunday", () => {
    // Good Friday 2026 is a Friday; Labour Day is a Friday; CNY is a Tuesday.
    expect(serviceDayOf(sg("2026-04-03"))).toBe("sunday");
    expect(serviceDayOf(sg("2026-05-01"))).toBe("sunday");
    expect(serviceDayOf(sg("2026-02-17"))).toBe("sunday");
  });

  it("treats the Monday in lieu as Sunday", () => {
    // National Day 2026 falls on a Sunday, so the Monday is gazetted too and
    // it is the Monday that actually changes a timetable.
    expect(holidayOn(sg("2026-08-10"))).toBe("National Day (Observed)");
    expect(serviceDayOf(sg("2026-08-10"))).toBe("sunday");
  });

  it("overrides Saturday too, not only weekdays", () => {
    // Hari Raya Puasa 2026 is a Saturday. Saturday and Sunday timetables
    // differ, so defaulting to "saturday" here would be the wrong one.
    expect(sgDayOfWeek(sg("2026-03-21"))).toBe(6);
    expect(serviceDayOf(sg("2026-03-21"))).toBe("sunday");
  });

  it("leaves an ordinary day alone", () => {
    expect(serviceDayOf(sg("2026-04-02"))).toBe("weekday");
    expect(serviceDayOf(sg("2026-04-04"))).toBe("saturday");
    expect(holidayOn(sg("2026-04-02"))).toBeNull();
  });

  it("knows which years it can answer for", () => {
    // Outside MOM's gazetted range the answer is a guess, and the UI shows
    // every timetable rather than one that might be the wrong one.
    expect(holidaysCover(sg("2026-04-02"))).toBe(true);
    expect(holidaysCover(sg("2040-04-02"))).toBe(false);
  });
});

/**
 * A service day ends with its last train, not at midnight.
 *
 * This is what the timetable footnote has always been getting at — times past
 * midnight belong to the night before. The note was true and the code was
 * not: the day was picked from the calendar date, so at 00:30 on a Sunday the
 * app read Sunday's rows to someone waiting for Saturday's last train. While
 * all three timetables were on screen a reader could find the right one
 * themselves; showing today's alone took that away.
 */
describe("the small hours belong to the night before", () => {
  // 2026-09-19 is a Saturday, so 00:30 on the 20th is Saturday's last trains.
  const sgAt = (iso: string, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(`${iso}T${String(h - 8).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  };

  it("reads Saturday's timetable at half past midnight on Sunday", () => {
    expect(serviceDayOf(sgAt("2026-09-20", "12:30"))).toBe("sunday");
    expect(serviceDayOf(new Date("2026-09-19T16:30:00Z"))).toBe("saturday");
  });

  it("switches over in the gap when nothing is running", () => {
    // Across the whole feed the last train is 02:02 and the first is 05:13,
    // so 04:00 cannot be wrong for anyone.
    expect(serviceDayOf(new Date("2026-09-19T19:59:00Z"))).toBe("saturday");
    expect(serviceDayOf(new Date("2026-09-19T20:00:00Z"))).toBe("sunday");
  });

  it("keeps a holiday's timetable running into the next morning", () => {
    // Good Friday 2026 is 3 April. At 00:30 on the Saturday the trains still
    // running are the holiday's, and the holiday runs a Sunday timetable.
    expect(holidayOn(new Date("2026-04-03T16:30:00Z"))).toBe("Good Friday");
    expect(serviceDayOf(new Date("2026-04-03T16:30:00Z"))).toBe("sunday");
    // By the afternoon it is an ordinary Saturday again.
    expect(holidayOn(new Date("2026-04-04T06:00:00Z"))).toBeNull();
    expect(serviceDayOf(new Date("2026-04-04T06:00:00Z"))).toBe("saturday");
  });

  it("rolls back exactly one day, not two", () => {
    // serviceDayOf and holidayOn both need the rolled date, and a draft where
    // one called the other subtracted a day twice. 00:30 on 4 April would
    // then have landed on the 2nd, an ordinary Thursday, instead of Good
    // Friday — the same answer as having no holiday list at all.
    const at0030 = new Date("2026-04-03T16:30:00Z");
    expect(serviceDate(at0030).getTime()).toBe(at0030.getTime() - 24 * 60 * 60 * 1000);
    expect(holidayOn(at0030)).toBe("Good Friday");
    expect(serviceDayOf(at0030)).toBe("sunday");
  });
});
