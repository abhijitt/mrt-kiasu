import { describe, expect, it } from "vitest";
import { chooseFeature, leadsToTarget, type PlatformFeature } from "@/lib/feature-types";

const base = {
  source: "survey",
  confidence: "verified",
  verifiedAt: "2026-08-26",
  sourceNote: "Field survey",
} as const;

/**
 * The platform this whole change exists for: two escalators, one to the street
 * and one to the transfer corridor. Before "transfer" stopped being a type,
 * a surveyor had to choose between recording what the corridor escalator WAS
 * and recording where it went, and either choice lost something real.
 */
const toExit: PlatformFeature = {
  ...base, type: "escalator", doorIndex: 4, leadsTo: ["C"], travel: "up",
};
const toCorridor: PlatformFeature = {
  ...base, type: "escalator", doorIndex: 20, leadsTo: ["CCL"], travel: "up",
};
const liftToCorridor: PlatformFeature = {
  ...base, type: "lift", doorIndex: 18, leadsTo: ["CCL", "C"],
};
const platform = [toExit, liftToCorridor, toCorridor];

describe("one escalator can serve an exit and a transfer", () => {
  it("finds the corridor escalator by line code", () => {
    expect(chooseFeature(platform, "escalator", "CCL")).toBe(toCorridor);
  });

  it("finds the street escalator by exit code, on the same platform", () => {
    expect(chooseFeature(platform, "escalator", "C")).toBe(toExit);
  });

  it("keeps a lift preference across a transfer", () => {
    // The bug this replaces: a "transfer" feature had no device, so someone
    // with a pram was sent to an escalator with nothing said about it.
    expect(chooseFeature(platform, "lift", "CCL")).toBe(liftToCorridor);
  });

  it("matches a feature that leads to both", () => {
    expect(leadsToTarget(liftToCorridor, "C")).toBe(true);
    expect(leadsToTarget(liftToCorridor, "ccl")).toBe(true);
    expect(leadsToTarget(toExit, "CCL")).toBe(false);
  });
});

describe("chooseFeature refuses to invent a match", () => {
  it("returns null when nothing leads to the target", () => {
    expect(chooseFeature(platform, "escalator", "DTL")).toBeNull();
  });

  it("falls back to another device before an estimate, but only untargeted", () => {
    const stairsOnly: PlatformFeature = {
      ...base, type: "stairs", doorIndex: 8, leadsTo: ["A"],
    };
    const estimate: PlatformFeature = {
      type: "exit", doorIndex: 1, leadsTo: ["A"], source: "estimate",
      confidence: "estimate", sourceNote: "projected", offsetM: -30,
    };
    const fs = [stairsOnly, estimate];
    expect(chooseFeature(fs, "escalator")).toBe(stairsOnly);
    expect(chooseFeature(fs, "escalator", "A")).toBe(stairsOnly);
    expect(chooseFeature(fs, "escalator", "B")).toBeNull();
  });

  it("still skips a down-only escalator when targeting", () => {
    const down: PlatformFeature = {
      ...base, type: "escalator", doorIndex: 2, leadsTo: ["CCL"], travel: "down",
    };
    const stairs: PlatformFeature = {
      ...base, type: "stairs", doorIndex: 6, leadsTo: ["CCL"],
    };
    expect(chooseFeature([down, stairs], "escalator", "CCL")).toBe(stairs);
  });
});
