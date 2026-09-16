import { describe, expect, it } from "vitest";
import {
  chooseFeature,
  leadsToTarget,
  sameFeature,
  type PlatformFeature,
} from "@/lib/feature-types";

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

/**
 * A platform is not a set of equally good choices.
 *
 * The stairs at the far end of Paya Lebar genuinely reach Exits A and E, and a
 * surveyor who left them off would be hiding a real way out. But anyone sent
 * to them has been sent the long way round. Before `secondary` the dataset had
 * only two options, both wrong: record them and mislead, or omit them and lie
 * by omission.
 */
describe("a way that works but is not the best one", () => {
  const nearStairs: PlatformFeature = {
    ...base, type: "stairs", doorIndex: 10, leadsTo: ["A", "E"],
  };
  const farStairs: PlatformFeature = {
    ...base, type: "stairs", doorIndex: 6, leadsTo: ["A", "E"], secondaryFor: ["A", "E"],
  };

  it("sends people to the better one when both reach the exit", () => {
    // Listed first, so this fails if the rule is really just "take the first".
    expect(chooseFeature([farStairs, nearStairs], "stairs", "A")).toBe(nearStairs);
  });

  it("still offers the long way round when it is the only way", () => {
    expect(chooseFeature([farStairs], "stairs", "A")).toBe(farStairs);
  });

  it("does not demote it past a different kind of device", () => {
    // The preference is usually a need, not a taste: someone who asked for a
    // lift is not helped by being given good stairs instead.
    const lift: PlatformFeature = {
      ...base, type: "lift", doorIndex: 18, leadsTo: ["A"], secondaryFor: ["A"],
    };
    const escalator: PlatformFeature = {
      ...base, type: "escalator", doorIndex: 4, leadsTo: ["A"], travel: "up",
    };
    expect(chooseFeature([escalator, lift], "lift", "A")).toBe(lift);
  });

  it("ignores it for an exit it does not reach", () => {
    expect(chooseFeature([farStairs, nearStairs], "stairs", "C")).toBeNull();
  });

  it("prefers the better one when no target is given at all", () => {
    expect(chooseFeature([farStairs, nearStairs], "stairs")).toBe(nearStairs);
  });

  /**
   * Bras Basah: one escalator at each end of the platform. Each is the obvious
   * choice for the exits at its own end and a trek to the ones at the other.
   * A flag on the feature could only have said both were bad, or neither.
   */
  describe("best to one place and the long way to another", () => {
    const northEnd: PlatformFeature = {
      ...base, type: "escalator", doorIndex: 2, travel: "up",
      leadsTo: ["A", "B", "C"], secondaryFor: ["C"],
    };
    const southEnd: PlatformFeature = {
      ...base, type: "escalator", doorIndex: 11, travel: "up",
      leadsTo: ["A", "B", "C"], secondaryFor: ["A", "B"],
    };
    const platform = [northEnd, southEnd];

    it("sends each exit to the end it belongs to", () => {
      expect(chooseFeature(platform, "escalator", "A")).toBe(northEnd);
      expect(chooseFeature(platform, "escalator", "B")).toBe(northEnd);
      expect(chooseFeature(platform, "escalator", "C")).toBe(southEnd);
    });

    it("does not demote a feature that is best somewhere", () => {
      // With no target the question is whether it is ever the best way to
      // anywhere. Both are, so the first listed stands.
      expect(chooseFeature(platform, "escalator")).toBe(northEnd);
    });

    it("still offers the long way when it is the only way", () => {
      expect(chooseFeature([southEnd], "escalator", "A")).toBe(southEnd);
    });
  });
})

/**
 * One lift, two answers.
 *
 * A lift on an island platform has a facing. At Paya Lebar its door opens
 * toward the Eunos-bound side, so someone alighting there steps almost into
 * it while someone on the other face walks around the shaft and is better off
 * a few doors along. Matching on type and door alone made that read as two
 * lifts on a platform that has one.
 */
describe("the same physical thing, seen from both platforms", () => {
  const fromEunosSide: PlatformFeature = {
    ...base, type: "lift", id: "EW8-lift-1", doorIndex: 24, leadsTo: ["A"],
  };
  const fromAljuniedSide: PlatformFeature = {
    ...base, type: "lift", id: "EW8-lift-1", doorIndex: 17, leadsTo: ["A"],
  };

  it("knows a staggered lift is one lift", () => {
    expect(sameFeature(fromEunosSide, fromAljuniedSide)).toBe(true);
  });

  it("still tells two genuinely different lifts apart", () => {
    expect(sameFeature(fromEunosSide, { ...fromAljuniedSide, id: "EW8-lift-2" })).toBe(false);
  });

  it("falls back to type and door when nothing carries an id", () => {
    const a: PlatformFeature = { ...base, type: "stairs", doorIndex: 6, leadsTo: [] };
    expect(sameFeature(a, { ...a })).toBe(true);
    expect(sameFeature(a, { ...a, doorIndex: 7 })).toBe(false);
  });

  it("never merges an identified thing with an unidentified one", () => {
    // Silently absorbing an untagged record into an identified one would lose
    // a real feature, which is worse than carrying one too many.
    const untagged: PlatformFeature = { ...base, type: "lift", doorIndex: 24, leadsTo: ["A"] };
    expect(sameFeature(fromEunosSide, untagged)).toBe(false);
  });
})
