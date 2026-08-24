"use client";

import Link from "next/link";
import { AppHeader } from "./AppHeader";
import { useT } from "@/i18n/I18nProvider";

interface Props {
  /** Shown as the HUD title. Falls back to the app mark on the home screen. */
  title?: string;
  /** Where the back chevron goes. Omit to hide it. */
  backHref?: string;
  /** Line colour to run under the bar, tying a screen to its line. */
  accentVar?: string;
  children?: React.ReactNode;
}

/**
 * The dark status strip every screen wears.
 *
 * Keeping identity, language and settings in one fixed-looking bar — the way a
 * game keeps its HUD pinned — means inner pages read as part of the same app
 * rather than as loose documents, and the back affordance never moves.
 */
export function Hud({ title, backHref, accentVar, children }: Props) {
  const t = useT();

  return (
    <header className="hud">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              aria-label={t("common.back")}
              className="font-pixel shrink-0 text-lg leading-none opacity-80"
            >
              ‹
            </Link>
          )}
          <div className="min-w-0">
            {title ? (
              <p className="font-pixel text-xs leading-relaxed">{title}</p>
            ) : (
              <p className="font-pixel text-lg leading-none">
                MRT<span className="text-accent">Kiasu</span>
              </p>
            )}
            {children}
          </div>
        </div>
        <AppHeader />
      </div>
      {accentVar && (
        <div className="h-2 w-full" style={{ background: `var(${accentVar})` }} />
      )}
    </header>
  );
}
