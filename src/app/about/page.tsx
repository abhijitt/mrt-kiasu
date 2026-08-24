"use client";

import { LegalPage } from "@/components/LegalPage";

export default function AboutPage() {
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
    />
  );
}
