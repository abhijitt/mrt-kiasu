import type { MetadataRoute } from "next";
import { LINE_ORDER } from "@/lib/lines";
import { STATIONS } from "@/lib/stations";
import { siteUrl } from "@/lib/site";

/**
 * Every page worth indexing.
 *
 * The 213 station pages are the app's long tail — someone searching
 * "Bishan MRT exits" should be able to land straight on one — so they matter
 * more here than the handful of top-level routes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const stat = ["", "/about", "/privacy", "/terms", "/attribution"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.3,
  }));

  const lines = LINE_ORDER.map((code) => ({
    url: `${base}/line/${code}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const stations = STATIONS.map((s) => ({
    url: `${base}/station/${s.code}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  return [...stat, ...lines, ...stations];
}
