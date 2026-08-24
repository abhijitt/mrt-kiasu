"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/I18nProvider";

/**
 * Route-level error boundary. Without one, a thrown render error shows Next's
 * stock overlay in development and a blank page in production.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // No error service is wired up yet; the console is the only sink there is.
    console.error("[route error]", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Avatar id="rider" size={72} decorative />
      <h1 className="font-pixel text-sm leading-relaxed text-accent">
        {t("error.title")}
      </h1>
      <p className="text-base leading-relaxed text-fg-muted">{t("error.body")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="pixel-btn font-pixel px-5 py-4 text-xs uppercase"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {t("error.retry")}
        </button>
        <Link href="/" className="pixel-btn font-pixel px-5 py-4 text-xs uppercase">
          {t("error.goHome")}
        </Link>
      </div>
      {error.digest && (
        <p className="mt-2 text-xs text-fg-faint">ref: {error.digest}</p>
      )}
    </main>
  );
}
