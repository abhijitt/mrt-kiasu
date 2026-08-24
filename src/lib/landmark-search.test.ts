import { describe, expect, it } from "vitest";
import { matchScore, searchLandmarks, type Landmark } from "@/lib/landmark-types";
import { landmarksFor } from "@/lib/landmarks";

const moe: Landmark = {
  name: "Ministry of Education Sports & Recreation Club",
  kind: "sports", exit: "B", metres: 607,
  street: "Evans Road", terms: "evans road mesrc moesrc me moe",
};
const junction8: Landmark = {
  name: "Junction 8", kind: "mall", exit: "A", metres: 40,
  street: "Bishan Place", terms: "capitaland bishan place cl",
};

describe("matchScore", () => {
  it("finds a place by its street, not just its name", () => {
    // The original complaint: "evans" returned nothing.
    expect(matchScore(moe, "evans")).not.toBeNull();
    expect(matchScore(moe, "evans road")).not.toBeNull();
  });

  it("finds a place by acronym, including the linking-word form", () => {
    expect(matchScore(moe, "moe")).not.toBeNull();
    expect(matchScore(moe, "me")).not.toBeNull();
  });

  it("matches on word prefixes, so partial typing works", () => {
    expect(matchScore(junction8, "junc")).not.toBeNull();
    expect(matchScore(moe, "minis")).not.toBeNull();
  });

  it("requires every token to match, so extra words narrow the search", () => {
    expect(matchScore(moe, "evans sports")).not.toBeNull();
    expect(matchScore(moe, "evans pizza")).toBeNull();
  });

  it("rejects a place that matches nothing", () => {
    expect(matchScore(junction8, "evans")).toBeNull();
  });

  it("ranks a name match above a street match", () => {
    expect(matchScore(junction8, "junction")!).toBeLessThan(matchScore(junction8, "bishan")!);
  });
});

describe("searchLandmarks", () => {
  it("returns nothing for an empty query", () => {
    expect(searchLandmarks([moe, junction8], "  ")).toEqual([]);
  });

  it("orders better matches before merely nearer ones", () => {
    const results = searchLandmarks([moe, junction8], "bishan");
    expect(results[0].name).toBe("Junction 8");
  });

  it("finds the MOE campus from the real dataset by street", () => {
    const found = searchLandmarks(landmarksFor("CC19"), "evans");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].name).toContain("Ministry of Education");
  });

  it("finds a mall from the real dataset by partial name", () => {
    const found = searchLandmarks(landmarksFor("NS17"), "junc");
    expect(found.some((l) => l.name === "Junction 8")).toBe(true);
  });
});
