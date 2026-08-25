"use client";

import { useT } from "@/i18n/I18nProvider";

/**
 * Marks any build that is not the live site.
 *
 * Two jobs. A tester on beta.mrtkiasu.com should never have to check the
 * address bar to know which build they are looking at, and a bug report that
 * arrives from a pre-release build should be obviously that — otherwise a
 * problem already fixed on beta gets chased as though it were live.
 *
 * Renders nothing in production, so it costs the real site a single string
 * comparison and no markup.
 */
export function EnvBadge() {
  const t = useT();
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV;

  // Undefined off Vercel, so a local dev server is labelled too.
  if (env === "production") return null;

  return (
    <span
      className="font-pixel ml-2 inline-block border-2 px-1.5 py-0.5 align-middle text-[9px] uppercase leading-none"
      style={{ borderColor: "var(--candidate)", color: "var(--candidate)" }}
      title={t("env.betaHint")}
    >
      {env === "preview" ? t("env.beta") : t("env.dev")}
    </span>
  );
}
