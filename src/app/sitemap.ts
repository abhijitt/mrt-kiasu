import type { MetadataRoute } from "next";
import { LINE_ORDER } from "@/lib/lines";
import { STATIONS, canonicalCode, getGroup, stationsOnLine } from "@/lib/stations";
import { indexedRoutes } from "@/lib/indexed-routes";
import { newestOf, stationModified } from "@/lib/last-modified";
import { siteUrl } from "@/lib/site";

/**
 * Every page worth indexing, each dated by when its content last changed.
 *
 * The station pages are the app's long tail — someone searching
 * "Bishan MRT exits" should be able to land straight on one — so they matter
 * more here than the handful of top-level routes.
 *
 * Three rules keep this honest:
 *  - One entry per station. An interchange's other codes still have pages,
 *    but they name the listed one as canonical, and a sitemap should only
 *    list pages that are their own canonical.
 *  - Routes only where they are worth listing (see indexed-routes); the other
 *    33,000-odd are noindex, and listing a noindex page is a contradiction.
 *  - A date only where one is known. The static pages carry none rather than
 *    the build time, which is what taught crawlers to ignore the field here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  const stat = ["", "/about", "/privacy", "/terms", "/attribution"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.3,
  }));

  const lines = LINE_ORDER.map((code) => ({
    url: `${base}/line/${code}`,
    lastModified: newestOf(stationsOnLine(code).map((s) => stationModified(s.code))),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const stations = STATIONS.filter((s) => canonicalCode(s) === s.code).map((s) => ({
    url: `${base}/station/${s.code}`,
    lastModified: stationModified(s.code),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const routes = indexedRoutes().map((r) => ({
    url: `${base}${r.path}`,
    lastModified: newestOf(
      [r.from, r.to].map((name) => {
        const group = getGroup(name);
        return group ? stationModified(group.primaryCode) : undefined;
      }),
    ),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...stat, ...lines, ...stations, ...routes];
}
