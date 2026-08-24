"use client";

import { LegalPage } from "@/components/LegalPage";

/** Date the wording last changed. Update it whenever the substance does. */
const LAST_UPDATED = "2026-08-24";

export default function PrivacyPage() {
  return (
    <LegalPage
      titleKey="privacy.title"
      leadKey="privacy.lead"
      updated={LAST_UPDATED}
      sections={[
        { titleKey: "privacy.storedTitle", bodyKey: "privacy.storedBody" },
        { titleKey: "privacy.collectTitle", bodyKey: "privacy.collectBody" },
        { titleKey: "privacy.cookiesTitle", bodyKey: "privacy.cookiesBody" },
        { titleKey: "privacy.thirdPartyTitle", bodyKey: "privacy.thirdPartyBody" },
        { titleKey: "privacy.rightsTitle", bodyKey: "privacy.rightsBody" },
      ]}
    />
  );
}
