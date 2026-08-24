"use client";

import { LegalPage } from "@/components/LegalPage";
import { useT } from "@/i18n/I18nProvider";

const LAST_UPDATED = "2026-08-24";

export default function TermsPage() {
  const t = useT();

  return (
    <LegalPage
      titleKey="terms.title"
      updated={LAST_UPDATED}
      sections={[
        { titleKey: "terms.natureTitle", bodyKey: "terms.natureBody" },
        { titleKey: "terms.accuracyTitle", bodyKey: "terms.accuracyBody" },
        { titleKey: "terms.liabilityTitle", bodyKey: "terms.liabilityBody" },
        { titleKey: "terms.changesTitle", bodyKey: "terms.changesBody" },
      ]}
    >
      {/* Machine translation is fine for a station description and not for a
          legal commitment, so the English text is the one that governs. */}
      <p
        className="pixel-box-sm p-3 text-sm leading-relaxed"
        style={{ borderColor: "var(--candidate)" }}
      >
        {t("terms.englishNote")}
      </p>
    </LegalPage>
  );
}
