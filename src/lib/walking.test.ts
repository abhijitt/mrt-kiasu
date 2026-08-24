import { describe, expect, it } from "vitest";
import { WALKING_SPEED_MS, secondsSaved, trainLengthM } from "@/lib/walking";

describe("trainLengthM", () => {
  it("matches the figure the estimator uses", () => {
    // 2 driving cars at 23.65 m + 4 intermediates at 22.8 m.
    expect(trainLengthM("NEL")).toBeCloseTo(138.5, 1);
    expect(trainLengthM("DTL")).toBeCloseTo(70.1, 1);
    expect(trainLengthM("TEL")).toBeCloseTo(92.9, 1);
  });

  it("returns null for lines with no sourced fleet data", () => {
    expect(trainLengthM("BPLRT")).toBeNull();
  });
});

describe("secondsSaved", () => {
  it("saves most at an end of the train", () => {
    const atEnd = secondsSaved(69, "NEL")!;
    const atCentre = secondsSaved(0, "NEL")!;
    expect(atEnd).toBeGreaterThan(atCentre);
  });

  it("is symmetric about the centre", () => {
    expect(secondsSaved(40, "NEL")).toBe(secondsSaved(-40, "NEL"));
  });

  it("gives a plausible figure for a 6-car train", () => {
    // Worst case is the full train length, ~138.5 m at 1.2 m/s ≈ 115 s.
    expect(secondsSaved(69.25, "NEL")).toBeLessThanOrEqual(120);
    expect(secondsSaved(69.25, "NEL")).toBeGreaterThan(90);
  });

  it("never claims a saving longer than walking the whole train", () => {
    for (const line of ["NSL", "CCL", "TEL"] as const) {
      const max = trainLengthM(line)! / WALKING_SPEED_MS;
      for (const offset of [-100, -30, 0, 30, 100]) {
        expect(secondsSaved(offset, line)!).toBeLessThanOrEqual(Math.ceil(max));
      }
    }
  });

  it("returns null where no train geometry is sourced", () => {
    expect(secondsSaved(20, "SKLRT")).toBeNull();
  });
});

describe("anniversaryYears", () => {
  it("fires only on the opening date", async () => {
    const { anniversaryYears } = await import("@/lib/trivia");
    // Yio Chu Kang opened 7 November 1987, in the first batch of five.
    expect(anniversaryYears("NS15", new Date("2026-11-07T09:00:00+08:00"))).toBe(39);
    expect(anniversaryYears("NS15", new Date("2026-11-08T09:00:00+08:00"))).toBeNull();
  });

  it("stays silent on the opening day itself", async () => {
    const { anniversaryYears } = await import("@/lib/trivia");
    expect(anniversaryYears("NS15", new Date("1987-11-07T09:00:00+08:00"))).toBeNull();
  });
});
