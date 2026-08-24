/**
 * Canonical origin for absolute URLs in metadata, sitemaps and robots.
 *
 * Vercel exposes the deployment host but not the scheme, and localhost needs
 * http, so this normalises all three cases rather than hardcoding a domain
 * that would be wrong in preview builds.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
