import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The app has no third-party scripts, no analytics and self-hosted fonts, so a
 * strict policy costs nothing here — the only relaxation is 'unsafe-inline'
 * for styles, which Next's runtime and our inline theme script require.
 */
// React Fast Refresh evaluates its runtime as a string, so `next dev` needs
// 'unsafe-eval'. Omitting it does not merely disable hot reload — main-app.js
// throws before hydration and nothing on the page becomes interactive, which
// makes local testing quietly meaningless. Production builds never eval.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      // Only our own API routes are called from the browser.
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    // Mapped explicitly rather than relying on Vercel's "expose system
    // environment variables" toggle: the badge that tells a tester they are
    // NOT on the live site must not depend on a dashboard setting anyone can
    // switch off. Empty string off Vercel, which the badge treats as dev.
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
