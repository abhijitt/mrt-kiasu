import { describe, expect, it } from "vitest";
import {
  connectionAtRisk,
  LAST_TRAIN_WARNING_MINUTES,
  serviceDayOf,
  statusFor,
  worstStatus,
  type TrainTime,
} from "./service-status";

/** Bishan towards Marina South Pier, weekday: real values from the feed. */
const ROW: TrainTime = { towards: "Marina South Pier", first: "06:09", last: "23:40" };
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
    expect(statusFor(ROW, at(23, 40 - LAST_TRAIN_WARNING_MINUTES - 5)).kind).toBe("running");
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
      worstStatus([{ kind: "running" }, { kind: "lastSoon", last: "23:40", minutesLeft: 10 }]).kind,
    ).toBe("lastSoon");
    expect(
      worstStatus([
        { kind: "lastSoon", last: "23:40", minutesLeft: 10 },
        { kind: "afterLast", last: "23:20" },
      ]).kind,
    ).toBe("afterLast");
  });

  it("is running when everything is running", () => {
    expect(worstStatus([{ kind: "running" }, { kind: "running" }]).kind).toBe("running");
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
