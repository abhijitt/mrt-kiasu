"use client";

import Link from "next/link";
import { Hud } from "@/components/Hud";
import { useT } from "@/i18n/I18nProvider";
import { REPO_URL } from "@/lib/site";
import type { MessageKey } from "@/i18n/I18nProvider";

export interface Section {
  titleKey: MessageKey;
  bodyKey: MessageKey;
}

interface Props {
  titleKey: MessageKey;
  leadKey?: MessageKey;
  /** ISO date shown as "last updated"; omit where it doesn't apply. */
  updated?: string;
  sections: Section[];
  children?: React.ReactNode;
}

/**
 * Shared shell for the informational pages.
 *
 * They differ only in their content, so one layout keeps them consistent and
 * makes adding another a matter of listing message keys.
 */
export function LegalPage({ titleKey, leadKey, updated, sections, children }: Props) {
  const t = useT();

  return (
    <div className="min-h-dvh">
      <Hud title={t(titleKey)} backHref="/" />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
        {leadKey && (
          <p className="pixel-box anim-enter p-4 text-base leading-relaxed text-fg">
            {t(leadKey)}
          </p>
        )}

        {updated && (
          <p className="text-xs text-fg-faint">
            {t("privacy.updated" as MessageKey, { date: updated })}
          </p>
        )}

        {children}

        {sections.map((s) => (
          <section key={s.titleKey} className="pixel-box anim-enter p-4">
            <h2 className="font-pixel text-xs uppercase text-fg-muted">{t(s.titleKey)}</h2>
            <p className="mt-3 text-base leading-relaxed text-fg">{t(s.bodyKey)}</p>
          </section>
        ))}

        <LegalFooter />
      </main>
    </div>
  );
}

/** Cross-links between the informational pages, plus a way back. */
export function LegalFooter() {
  const t = useT();
  const links: { href: string; key: MessageKey }[] = [
    { href: "/about", key: "nav.about" },
    { href: "/privacy", key: "nav.privacy" },
    { href: "/terms", key: "nav.terms" },
    { href: "/attribution", key: "nav.attribution" },
  ];

  return (
    <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="font-pixel text-[11px] uppercase text-fg-muted underline"
        >
          {t(l.key)}
        </Link>
      ))}
      <Link href="/report" className="font-pixel text-[11px] uppercase text-fg-muted underline">
        {t("report.link")}
      </Link>
      {/* Leaves the site, so it is a plain anchor rather than a Link, and
          carries noreferrer alongside noopener. */}
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-pixel text-[11px] uppercase text-fg-muted underline"
      >
        {t("nav.source")}
      </a>
    </nav>
  );
}
