import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "./site";

/**
 * The failure these guard against is silent: a preview that calls itself
 * production emits perfectly valid pages whose canonical, Open Graph and
 * sitemap URLs all point at the live site. Nothing errors — you find out when
 * search engines start conflating the two.
 */
describe("resolveSiteUrl", () => {
  it("prefers an explicit override above everything", () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: "https://mrtkiasu.com",
        VERCEL_ENV: "preview",
        VERCEL_URL: "beta-abc123.vercel.app",
      }),
    ).toBe("https://mrtkiasu.com");
  });

  it("strips a trailing slash from the override", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://mrtkiasu.com/" })).toBe(
      "https://mrtkiasu.com",
    );
  });

  it("uses the production host only on the production deployment", () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "mrtkiasu.com",
        VERCEL_URL: "mrt-kiasu-xyz.vercel.app",
      }),
    ).toBe("https://mrtkiasu.com");
  });

  it("makes a preview describe itself, never production", () => {
    // VERCEL_PROJECT_PRODUCTION_URL is set on previews too — that is exactly
    // the trap, so it is present here on purpose.
    expect(
      resolveSiteUrl({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "mrtkiasu.com",
        VERCEL_URL: "mrt-kiasu-git-beta.vercel.app",
      }),
    ).toBe("https://mrt-kiasu-git-beta.vercel.app");
  });

  it("never lets a non-production deployment claim the production host", () => {
    for (const env of ["preview", "development"]) {
      const url = resolveSiteUrl({
        VERCEL_ENV: env,
        VERCEL_PROJECT_PRODUCTION_URL: "mrtkiasu.com",
        VERCEL_URL: "some-deployment.vercel.app",
      });
      expect(url, env).not.toContain("mrtkiasu.com");
    }
  });

  it("falls back to localhost off Vercel", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });
});
