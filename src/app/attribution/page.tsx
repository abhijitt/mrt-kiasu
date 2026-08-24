"use client";

import { LegalPage } from "@/components/LegalPage";

export default function AttributionPage() {
  return (
    <LegalPage
      titleKey="attribution.title"
      leadKey="attribution.lead"
      sections={[
        { titleKey: "attribution.ltaTitle", bodyKey: "attribution.ltaBody" },
        { titleKey: "attribution.osmTitle", bodyKey: "attribution.osmBody" },
        { titleKey: "attribution.wikiTitle", bodyKey: "attribution.wikiBody" },
        { titleKey: "attribution.translationTitle", bodyKey: "attribution.translationBody" },
        { titleKey: "attribution.fontsTitle", bodyKey: "attribution.fontsBody" },
        { titleKey: "attribution.disclaimerTitle", bodyKey: "attribution.disclaimerBody" },
      ]}
    />
  );
}
