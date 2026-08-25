/**
 * Canonical origin for absolute URLs in metadata, sitemaps and robots.
 *
 * Vercel exposes the deployment host but not the scheme, and localhost needs
 * http, so this normalises all three cases rather than hardcoding a domain
 * that would be wrong in preview builds.
 */

export interface SiteEnv {
  NEXT_PUBLIC_SITE_URL?: string;
  /** "production" | "preview" | "development" on Vercel. */
  VERCEL_ENV?: string;
  /** The project's production host — set in EVERY environment, previews too. */
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  /** This particular deployment's own host. */
  VERCEL_URL?: string;
}

/**
 * Pure, so the environment-branching can be tested without a live deploy.
 *
 * The order matters and is not obvious: `VERCEL_PROJECT_PRODUCTION_URL` is
 * present on preview deployments too, so reading it before checking
 * `VERCEL_ENV` made every preview claim to be the production site. On the beta
 * subdomain that meant its own canonical tags, Open Graph tags and sitemap all
 * pointed at mrtkiasu.com — inviting search engines and link previews to treat
 * beta's content as production's.
 */
export function resolveSiteUrl(env: SiteEnv): string {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  // Only the production deployment may claim the production host.
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // Any other deployment describes itself, never production.
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;

  // Outside Vercel entirely (local dev, CI) there is no deployment host.
  if (env.VERCEL_PROJECT_PRODUCTION_URL && !env.VERCEL_ENV) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

export function siteUrl(): string {
  return resolveSiteUrl(process.env as SiteEnv);
}

/**
 * True when this is the real, public deployment.
 *
 * Anything else — the beta subdomain, a pull-request preview, a laptop — says
 * so in the UI, so nobody reports a bug from a build that was never live.
 */
export function isProductionDeployment(): boolean {
  return process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
}

/**
 * Where the source and the data live.
 *
 * A constant rather than a message string: it is a URL, not prose, so it must
 * not drift between the four translations.
 */
export const REPO_URL = "https://github.com/abhijitt/mrt-kiasu";
