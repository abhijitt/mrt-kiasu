import type { MetadataRoute } from "next";
import { isProductionDeployment, siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Beta is a real, publicly reachable domain. Vercel only marks *.vercel.app
  // preview URLs as noindex — a custom domain bound to a preview branch gets
  // no such protection — so without this, beta.mrtkiasu.com would compete with
  // production for the same searches on identical content.
  if (!isProductionDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

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
