"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Hud } from "@/components/Hud";
import { ReportForm } from "@/components/ReportForm";
import { useT } from "@/i18n/I18nProvider";

function ReportBody() {
  const t = useT();
  const params = useSearchParams();
  // Set by the "report a problem" links on station and route pages, so a
  // report arrives already knowing what it is about.
  const subject = params.get("subject") ?? undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
      <p className="pixel-box-sm anim-enter p-3 text-sm leading-relaxed text-fg-muted">
        {t("report.intro")}
      </p>
      {subject && (
        <p className="font-pixel text-[11px] uppercase text-fg-faint">{subject}</p>
      )}
      <ReportForm subject={subject} />
    </main>
  );
}

export default function ReportPage() {
  return (
    <div className="min-h-dvh">
      <ReportHud />
      <Suspense fallback={null}>
        <ReportBody />
      </Suspense>
    </div>
  );
}

function ReportHud() {
  const t = useT();
  return <Hud title={t("report.title")} backHref="/" />;
}
