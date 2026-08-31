import { describe, expect, it } from "vitest";
import { isCanonicalSlug, stationSlug } from "./station-slug";
import { getGroup, STATIONS } from "./stations";

/**
 * Slugs replaced %20 in route URLs, which is only safe if every station gets
 * its own slug and every link already in the wild still resolves.
 */

describe("station slugs", () => {
  it("replaces spaces rather than encoding them", () => {
    expect(stationSlug("Paya Lebar")).toBe("paya-lebar");
    expect(stationSlug("Ang Mo Kio")).toBe("ang-mo-kio");
  });

  it("leaves a name that is already hyphenated alone", () => {
    // one-north is the only station whose name carries punctuation.
    expect(stationSlug("one-north")).toBe("one-north");
  });

  it("gives every station in the network its own slug", () => {
    // A collision would silently route two stations to one page, and the
    // symptom would be a plausible-looking journey to the wrong place.
    const names = [...new Set(STATIONS.map((s) => s.name))];
    const slugs = names.map(stationSlug);
    expect(new Set(slugs).size).toBe(names.length);
  });

  it("never produces a slug needing URL encoding", () => {
    for (const name of new Set(STATIONS.map((s) => s.name))) {
      const slug = stationSlug(name);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  it("resolves both the slug and the original name", () => {
    // Links written before slugs existed are in browser history and in chat
    // threads; they have to keep working.
    expect(getGroup("paya-lebar")?.name).toBe("Paya Lebar");
    expect(getGroup("Paya Lebar")?.name).toBe("Paya Lebar");
    expect(getGroup("PAYA LEBAR")?.name).toBe("Paya Lebar");
  });

  it("still refuses a station that does not exist", () => {
    expect(getGroup("not-a-station")).toBeNull();
  });

  it("recognises only the canonical form as canonical", () => {
    expect(isCanonicalSlug("paya-lebar", "Paya Lebar")).toBe(true);
    expect(isCanonicalSlug("Paya Lebar", "Paya Lebar")).toBe(false);
    expect(isCanonicalSlug("Paya%20Lebar", "Paya Lebar")).toBe(false);
  });
});
