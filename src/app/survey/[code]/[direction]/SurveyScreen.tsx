"use client";

import { Hud } from "@/components/Hud";
import { SurveyForm } from "./SurveyForm";
import { useT } from "@/i18n/I18nProvider";
import { LINES } from "@/lib/lines";
import type { Direction } from "@/lib/doors";
import type { LineCode } from "@/lib/lines";
import type { PlatformFeature } from "@/lib/feature-types";

interface Props {
  stationCode: string;
  stationName: string;
  line: LineCode;
  direction: Direction;
  towards: string;
  totalDoors: number;
  exitCodes: string[];
  interchanges: string[];
  existing: PlatformFeature[];
}

export function SurveyScreen(p: Props) {
  const t = useT();

  return (
    <div className="min-h-dvh">
      <Hud
        title={t("survey.title", { station: p.stationName })}
        backHref={`/station/${p.stationCode}`}
        accentVar={LINES[p.line].colorVar}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-16 pt-5">
        <p className="pixel-box-sm anim-enter p-3 text-sm leading-relaxed text-fg-muted">
          {t("survey.intro", { direction: p.towards })}
        </p>

        <SurveyForm {...p} />
      </main>
    </div>
  );
}
