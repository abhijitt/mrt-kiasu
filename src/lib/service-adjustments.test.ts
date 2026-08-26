import { describe, expect, it } from "vitest";
import {
  activeAdjustments,
  adjustmentsFor,
  applyAdjustment,
  closuresFor,
  dayNameOf,
  isoDateOf,
} from "@/lib/service-adjustments";
import type { TrainTime } from "@/lib/service-status";

// Local time, so the date is the Singapore calendar date the app reasons about.
const at = (iso: string) => new Date(`${iso}T12:00:00`);

const dtl: TrainTime = { towards: "Bukit Panjang", first: "05:36", last: "00:35" };

describe("in-force window", () => {
  it("includes both ends of the range", () => {
    expect(adjustmentsFor("DTL", at("2026-07-10"))).toHaveLength(1); // activeFrom
    expect(adjustmentsFor("DTL", at("2026-09-05"))).toHaveLength(1); // activeTo
  });

  it("is not in force a day either side", () => {
    expect(adjustmentsFor("DTL", at("2026-07-09"))).toHaveLength(0);
    expect(adjustmentsFor("DTL", at("2026-09-06"))).toHaveLength(0);
  });

  it("does not leak to another line", () => {
    expect(adjustmentsFor("NSL", at("2026-08-26"))).toHaveLength(0);
  });
});

describe("applyAdjustment replaces only what the alert states", () => {
  it("moves the last train on a Friday inside the window", () => {
    // 2026-08-28 is a Friday.
    const friday = at("2026-08-28");
    expect(dayNameOf(friday)).toBe("friday");
    const out = applyAdjustment(dtl, "DTL", friday);
    expect(out.last).toBe("23:30");
    expect(out.adjustedBy?.id).toBe("dtl-friday-night-2026");
  });

  it("leaves the first train alone on that Friday", () => {
    // The alert says nothing about Friday morning, so neither do we.
    expect(applyAdjustment(dtl, "DTL", at("2026-08-28")).first).toBe("05:36");
  });

  it("moves the first train on a Saturday and leaves the last", () => {
    const saturday = at("2026-08-29");
    expect(dayNameOf(saturday)).toBe("saturday");
    const out = applyAdjustment(dtl, "DTL", saturday);
    expect(out.first).toBe("08:30");
    expect(out.last).toBe("00:35");
  });

  it("does not touch a Thursday, which the alert never mentions", () => {
    const out = applyAdjustment(dtl, "DTL", at("2026-08-27"));
    expect(out).toEqual(dtl);
    expect(out.adjustedBy).toBeUndefined();
  });

  it("does not touch the same Friday outside the window", () => {
    // 2026-09-11 is a Friday, but the adjustment ended on 5 Sep.
    const out = applyAdjustment(dtl, "DTL", at("2026-09-11"));
    expect(out.last).toBe("00:35");
  });

  it("never applies a closure as a schedule change", () => {
    const lrt: TrainTime = { towards: "Renjong", first: "05:13", last: "00:23" };
    const out = applyAdjustment(lrt, "SKLRT", at("2026-08-26"));
    expect(out).toEqual(lrt);
    expect(closuresFor("SKLRT", at("2026-08-26"))).toHaveLength(1);
  });
});

describe("provenance is present on every entry", () => {
  it("cites the alert text containing each stated time", () => {
    for (const a of activeAdjustments(at("2026-08-26"))) {
      expect(a.sourceNote.length).toBeGreaterThan(0);
      expect(a.citedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const o of a.overrides ?? []) {
        // "23:30" must be readable in the citation, as "11.30pm" or "23:30".
        for (const t of [o.first, o.last].filter(Boolean) as string[]) {
          const [h, m] = t.split(":").map(Number);
          const h12 = ((h! + 11) % 12) + 1;
          const ampm = h! < 12 ? "am" : "pm";
          const spoken = `${h12}.${String(m).padStart(2, "0")}${ampm}`;
          expect(
            a.sourceNote.includes(t) || a.sourceNote.toLowerCase().includes(spoken),
          ).toBe(true);
        }
      }
    }
  });
});

describe("date helpers", () => {
  it("formats the local calendar date", () => {
    expect(isoDateOf(new Date("2026-08-26T23:59:00"))).toBe("2026-08-26");
  });
});
