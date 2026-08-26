import { describe, expect, it } from "vitest";
import { describeDrift, findDrift, isClean, type AlertMessage } from "@/lib/adjustment-drift";
import type { ServiceAdjustment } from "@/lib/service-adjustments";

const at = (iso: string) => new Date(`${iso}T12:00:00`);

const DTL_TEXT =
  "23:30-DTL-Planned Service Adjustments. From 10 Jul to 5 Sep 2026, Downtown Line services will end at 11.30pm on Friday nights and commence at 8.30am on Saturday mornings. Please use alternative MRT lines and bus services.";

const dtl: ServiceAdjustment = {
  id: "dtl-friday-night-2026",
  lines: ["DTL"],
  activeFrom: "2026-07-10",
  activeTo: "2026-09-05",
  effect: "modified-schedule",
  overrides: [{ days: ["friday"], last: "23:30" }],
  source: "lta-alert",
  sourceNote: DTL_TEXT,
  citedOn: "2026-08-26",
};

const alert = (Content: string): AlertMessage => ({ Content, CreatedDate: "2026-07-09 20:00:20" });

describe("findDrift", () => {
  it("is clean when the feed matches what we recorded", () => {
    const d = findDrift([alert(DTL_TEXT)], [dtl], at("2026-08-26"));
    expect(isClean(d)).toBe(true);
    expect(describeDrift(d)).toContain("No drift");
  });

  it("ignores whitespace differences in the alert text", () => {
    const d = findDrift([alert(DTL_TEXT.replace(". From", ".  From"))], [dtl], at("2026-08-26"));
    expect(isClean(d)).toBe(true);
  });

  it("flags a planned adjustment we have not transcribed", () => {
    const other = alert("06:00-NEL-Planned Service Adjustment. From 1 Oct to 2 Oct 2026, ...");
    const d = findDrift([alert(DTL_TEXT), other], [dtl], at("2026-08-26"));
    expect(d.unrecorded).toHaveLength(1);
    expect(describeDrift(d)).toContain("UNRECORDED");
  });

  it("ignores a transient disruption, which is not a schedule change", () => {
    const bus = alert("26/08/2026 09:36-Bus services 161 and 168 are delayed by up to 20 minutes.");
    const d = findDrift([alert(DTL_TEXT), bus], [dtl], at("2026-08-26"));
    expect(isClean(d)).toBe(true);
    // ...but it is still carried through for a person to read.
    expect(d.allAlerts).toHaveLength(2);
  });

  it("flags an in-force entry that LTA has stopped publishing", () => {
    const d = findDrift([], [dtl], at("2026-08-26"));
    expect(d.vanished.map((a) => a.id)).toEqual(["dtl-friday-night-2026"]);
    expect(describeDrift(d)).toContain("VANISHED");
  });

  it("flags an entry past its end date, and does not also call it vanished", () => {
    const d = findDrift([], [dtl], at("2026-09-20"));
    expect(d.expired.map((a) => a.id)).toEqual(["dtl-friday-night-2026"]);
    expect(d.vanished).toHaveLength(0);
    expect(describeDrift(d)).toContain("EXPIRED");
  });

  it("treats the final day as still in force", () => {
    const d = findDrift([alert(DTL_TEXT)], [dtl], at("2026-09-05"));
    expect(d.expired).toHaveLength(0);
    expect(isClean(d)).toBe(true);
  });
});
