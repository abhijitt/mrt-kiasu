import { describe, expect, it } from "vitest";
import { findExitGuidance, servesAlighting, type PlatformFeature } from "@/lib/positions";

describe("escalator direction", () => {
  // Which way the steps move is not the same question as whether they help.
  // This asserted that "down" disqualified an escalator until two stations
  // disproved it: Aljunied's platform is elevated, so down IS the way out, and
  // Bayfront's Downtown Line sits below its Circle Line platform. What settles
  // it is not the travel direction but whether someone checked.
  it("keeps a surveyed down escalator that says where it goes", () => {
    const down: PlatformFeature = {
      type: "escalator", doorIndex: 3, leadsTo: ["A"], source: "survey",
      confidence: "verified", verifiedAt: "2026-01-01", sourceNote: "x", travel: "down",
    };
    const up: PlatformFeature = { ...down, doorIndex: 9, travel: "up" };
    expect(servesAlighting(down)).toBe(true);
    expect(servesAlighting(up)).toBe(true);
    expect(servesAlighting({ ...down, travel: "reversible" })).toBe(true);
  });

  it("still drops a down escalator nobody checked, or that leads nowhere named", () => {
    // A guessed down-only escalator is the one that strands someone, and a
    // surveyed one with an empty leadsTo cannot be offered as a way anywhere.
    const down: PlatformFeature = {
      type: "escalator", doorIndex: 3, leadsTo: ["A"], source: "survey",
      confidence: "verified", verifiedAt: "2026-01-01", sourceNote: "x", travel: "down",
    };
    expect(servesAlighting({ ...down, source: "estimate", confidence: "estimate" })).toBe(false);
    expect(servesAlighting({ ...down, leadsTo: [] })).toBe(false);
  });

  it("treats stairs and lifts as usable regardless of travel", () => {
    const stairs: PlatformFeature = {
      type: "stairs", doorIndex: 5, leadsTo: [], source: "survey",
      confidence: "verified", verifiedAt: "2026-01-01", sourceNote: "x",
    };
    expect(servesAlighting(stairs)).toBe(true);
  });
});

describe("findExitGuidance falls back honestly", () => {
  it("returns an exit estimate when nothing is surveyed", () => {
    // NS17 Bishan has estimates only.
    const f = findExitGuidance("NS17", "asc", "escalator");
    expect(f).not.toBeNull();
    expect(f!.type).toBe("exit");
    expect(f!.confidence).toBe("estimate");
  });

  it("targets a specific exit when asked", () => {
    const a = findExitGuidance("NS17", "asc", "escalator", "A");
    const b = findExitGuidance("NS17", "asc", "escalator", "B");
    expect(a!.leadsTo).toContain("A");
    expect(b!.leadsTo).toContain("B");
  });

  it("returns null for an exit that does not exist", () => {
    expect(findExitGuidance("NS17", "asc", "escalator", "ZZ")).toBeNull();
  });
});
