import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The survey tool and the report form are for people, not crawlers, and
      // indexing them would surface half-finished data-entry screens.
      disallow: ["/api/", "/survey/", "/report"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
