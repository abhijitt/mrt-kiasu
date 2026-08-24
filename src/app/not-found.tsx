"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Hud } from "@/components/Hud";
import { useT } from "@/i18n/I18nProvider";

/**
 * Replaces Next's stock black-and-white 404, which had no way back to the app
 * and looked like a different site entirely.
 */
export default function NotFound() {
  const t = useT();

  return (
    <div className="min-h-dvh">
      <Hud />
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 pb-16 pt-10 text-center">
        <Avatar id="tourist" size={72} decorative className="anim-bob" />
        <h1 className="font-pixel text-lg text-fg">404</h1>
        <p className="font-pixel text-xs leading-relaxed text-accent">
          {t("error.notFound")}
        </p>
        <p className="text-base leading-relaxed text-fg-muted">
          {t("error.notFoundBody")}
        </p>
        <Link
          href="/"
          className="pixel-btn font-pixel mt-2 px-5 py-4 text-xs uppercase"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {t("error.goHome")}
        </Link>
      </main>
    </div>
  );
}
