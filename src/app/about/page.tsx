"use client";

import { LegalPage } from "@/components/LegalPage";
import { useT } from "@/i18n/I18nProvider";
import { REPO_URL } from "@/lib/site";

export default function AboutPage() {
  const t = useT();

  return (
    <LegalPage
      titleKey="about.title"
      leadKey="about.lead"
      sections={[
        { titleKey: "about.whyTitle", bodyKey: "about.whyBody" },
        { titleKey: "about.honestyTitle", bodyKey: "about.honestyBody" },
        { titleKey: "about.dataTitle", bodyKey: "about.dataBody" },
        { titleKey: "about.contributeTitle", bodyKey: "about.contributeBody" },
      ]}
    >
      {/* Its own card rather than another prose section: this is the one place
          on the page asking for something back, and the ask is only useful if
          the link is impossible to miss. */}
      <section className="pixel-box anim-enter p-4" style={{ borderColor: "var(--accent)" }}>
        <h2 className="font-pixel text-xs uppercase" style={{ color: "var(--accent)" }}>
          {t("about.sourceTitle")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-fg">{t("about.sourceBody")}</p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pixel-btn font-pixel mt-4 inline-flex min-h-11 items-center px-4 py-3 text-xs uppercase"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {t("about.sourceCta")}
        </a>
      </section>
    </LegalPage>
  );
}
