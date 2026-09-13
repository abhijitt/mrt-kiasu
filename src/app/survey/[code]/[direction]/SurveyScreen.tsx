"use client";

import Link from "next/link";
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
  /** Which side the doors open here, where we know — it orients the diagram. */
  doorSide?: "left" | "right";
  /** Every surveyable platform at this station, its own code included. */
  platforms: { code: string; line: LineCode; direction: Direction; nextStop: string }[];
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

        {/* A surveyor is standing in the station, not on one platform of it.
            Walking to the opposite face, or to the other line's platforms
            downstairs, is a few seconds — and going back out to the station
            page to find the link is the thing that stops it happening. */}
        {p.platforms.length > 1 && (
          <nav className="anim-enter flex flex-col gap-2" aria-label={t("survey.switchPlatform")}>
            <p className="text-sm text-fg-muted">{t("survey.switchPlatform")}</p>
            <div className="flex flex-wrap gap-2">
              {p.platforms.map((pl) => {
                const here = pl.code === p.stationCode && pl.direction === p.direction;
                return here ? (
                  <span
                    key={`${pl.code}:${pl.direction}`}
                    aria-current="page"
                    className="pixel-box-sm font-pixel flex items-center gap-2 px-3 py-2 text-[10px] uppercase"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    <span>{pl.code}</span>
                    <span className="normal-case opacity-80">{pl.nextStop}</span>
                  </span>
                ) : (
                  <Link
                    key={`${pl.code}:${pl.direction}`}
                    href={`/survey/${pl.code}/${pl.direction}`}
                    className="pixel-btn font-pixel flex items-center gap-2 px-3 py-2 text-[10px] uppercase"
                  >
                    <span style={{ color: `var(${LINES[pl.line].colorVar})` }}>{pl.code}</span>
                    <span className="normal-case text-fg-muted">{pl.nextStop}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        <SurveyForm {...p} />
      </main>
    </div>
  );
}
