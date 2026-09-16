"use client";

import Link from "next/link";
import { Hud } from "@/components/Hud";
import { CrowdLevel } from "@/components/CrowdLevel";
import { CrowdForecast } from "@/components/CrowdForecast";
import { LiftStatus, usePrefersLift } from "@/components/LiftStatus";
import { CheckIcon } from "@/components/icons";
import { TrainTimes, type ServiceDay, type TrainTime } from "@/components/TrainTimes";
import { ServiceWarning } from "@/components/ServiceWarning";
import { useI18n } from "@/i18n/I18nProvider";
import { useLineName } from "@/i18n/useLineName";
import type { MessageKey } from "@/i18n/I18nProvider";
import { groupByExit, type Landmark } from "@/lib/landmark-types";
import { ExitLandmarks } from "@/components/ExitLandmarks";
import { StationLayout, type LayoutBlockView } from "@/components/StationLayout";
import { SurveyProgress } from "@/components/SurveyProgress";
import { FEATURE_GLYPH } from "@/components/PlatformDiagram";
import { DEVICE_TYPES } from "@/lib/feature-types";
import type { LocalisedTrivia } from "@/lib/trivia";
import type { Locale } from "@/i18n/config";
import { type LineCode } from "@/lib/lines";

interface Props {
  code: string;
  name: string;
  nameZh: string;
  lineCode: LineCode;
  lineShortName: string;
  colorVar: string;
  inkVar: string;
  operator: string;
  opened: string | null;
  interchanges: { code: string; line: string }[];
  exits: string[];
  train: { cars: number; doorsPerCar: number } | null;
  trainSource: string | null;
  derived: { labelKey: string }[];
  /** This station's trivia in every language, so the client imports no dataset. */
  triviaByLocale: Partial<Record<Locale, LocalisedTrivia>>;
  /** Set only when today is this station's opening anniversary. */
  anniversaryYears: number | null;
  landmarks: Landmark[];
  /** Only this station's rows — the full timetable stays on the server. */
  trainTimes: Partial<Record<ServiceDay, TrainTime[]>> | null;
  dataGaps: string[];
  hasVerified: boolean;
  /** False for lines with no sourced fleet data — no door guidance is possible. */
  canGiveDoorGuidance: boolean;
  /** Every platform here, so both directions can be surveyed. */
  platforms: { direction: "asc" | "desc"; nextStop: string }[];
  /** Whether any estimated position exists for this station. */
  hasEstimates: boolean;
  /** The plan of every line's platforms here. */
  layoutBlocks: LayoutBlockView[];
  /** How completely each platform here has been surveyed. */
  coverage: {
    direction: "asc" | "desc";
    exitsCovered: number;
    exitsTotal: number;
    transfersCovered: number;
    transfersTotal: number;
    started: boolean;
    complete: boolean;
  }[];
}

export function StationScreen(p: Props) {
  const { t, locale } = useI18n();
  const prefersLift = usePrefersLift();
  const lineName = useLineName();
  // Chosen here rather than on the server because the locale is a client-side
  // preference; only this one station's variants were shipped.
  const trivia = p.triviaByLocale[locale] ?? p.triviaByLocale.en ?? null;

  const opened = p.opened
    ? new Date(p.opened).toLocaleDateString(locale === "en" ? "en-SG" : locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const byExit = groupByExit(p.landmarks);
  const exitCodes = Object.keys(byExit).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  return (
    <div className="min-h-dvh">
      <Hud title={p.name} backHref="/" accentVar={p.colorVar} />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-16 pt-5">
      {/* Station identity gets its line's colour as a full band, so the page
          is recognisably "a Circle Line station" before you read a word. */}
      <header
        className="pixel-box anim-enter anim-enter-1 flex items-center gap-3 p-4"
        style={{ background: `var(${p.colorVar})`, color: `var(${p.inkVar})` }}
      >
        <span
          className="font-pixel flex h-12 w-16 shrink-0 items-center justify-center border-2 border-[var(--border)] bg-[var(--bg-raised)] text-[11px] text-fg"
        >
          {p.code}
        </span>
        <div className="min-w-0">
          <h1 className="font-pixel text-sm leading-relaxed">{p.name}</h1>
          <p className="mt-1.5 text-xs opacity-80">
            {locale === "zh" && p.nameZh ? `${p.nameZh} · ` : ""}
            {lineName(p.lineCode)} · {p.operator}
          </p>
        </div>
      </header>

      {p.anniversaryYears !== null && (
        <p
          className="pixel-box-sm anim-pop p-3 text-sm leading-relaxed"
          style={{ borderColor: "var(--accent)" }}
        >
          🎂 {t("egg.anniversary", { years: p.anniversaryYears })}
        </p>
      )}

      {p.interchanges.length > 0 && (
        <section className="pixel-box p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">
            {t("station.interchange")}
          </h2>
          {/* The other line at this station is a different page, and a reader
              who wants its platforms has to be able to get there. Shown as a
              code alone it read as a label rather than a way through. */}
          <ul className="mt-3 flex flex-col gap-2">
            {p.interchanges.map((i) => (
              <li key={i.code}>
                <Link
                  href={`/station/${i.code}`}
                  className="pixel-btn flex min-h-12 items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="flex items-center gap-3">
                    <span className="font-pixel text-xs">{i.code}</span>
                    <span className="text-sm text-fg-muted">
                      {lineName(i.line as LineCode)}
                    </span>
                  </span>
                  <span aria-hidden className="text-fg-faint">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pixel-box anim-enter anim-enter-2 p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("station.crowdNow")}
        </h2>
        <CrowdLevel stationCode={p.code} line={p.lineCode} />
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("forecast.title")}
        </h2>
        <CrowdForecast stationCode={p.code} line={p.lineCode} />
      </section>

      {/* Ahead of everything else on the page: if the network is shut, no
          amount of door guidance is any use. */}
      <ServiceWarning times={p.trainTimes} />

      {/* Above lift status and below crowding: "have I missed the last train"
          is a more urgent question than either. */}
      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">{t("times.title")}</h2>
        <TrainTimes times={p.trainTimes} />
      </section>

      {/* Heading and all: LiftStatus renders nothing unless the lift is your
          preference, and an empty "Lift status" box reads as broken rather
          than as not applicable. */}
      {prefersLift && (
        <section className="pixel-box anim-enter p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">{t("lift.title")}</h2>
          <LiftStatus
            stationCodes={[p.code, ...p.interchanges.map((i) => i.code)]}
            stationName={p.name}
          />
        </section>
      )}

      {trivia && (
        <section className="pixel-box p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">
            {t("station.summary")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-fg">{trivia.summary}</p>
          {trivia.translated && (
            <p className="mt-2 text-xs text-fg-faint">{t("station.machineTranslated")}</p>
          )}
          <a className="mt-2 inline-block text-xs text-fg-faint underline" href={trivia.url}>
            {t("common.source")}
          </a>
        </section>
      )}

      {p.layoutBlocks.length > 0 && (
        <section className="pixel-box p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">
            {t("station.layoutHeading")}
          </h2>
          <div className="mt-3 flex flex-col gap-5">
            {p.layoutBlocks.map((block) => (
              <div key={block.code}>
                <p className="font-pixel text-[10px] uppercase" style={{ color: `var(${block.colorVar})` }}>
                  {block.code} · {lineName(block.line)}
                  <span className="ml-2 text-fg-faint">
                    {t(`layout.${block.layout ?? "unknown"}` as MessageKey)}
                  </span>
                </p>
                <div className="mt-2 border-3 border-[var(--border)] bg-bg-sunken p-2">
                  <StationLayout block={block} />
                </div>
                {/* Where each thing leads, in a list rather than on the plan.
                    Printed against the glyphs it crowded them off the platform
                    the moment a station had more than a couple of exits.
                    Grouped by platform, because at a split island the two
                    platforms have their own escalators and a flat list made
                    one station's two look like one platform's duplicates. */}
                {block.platforms.map((pf, pi) => (
                    <div key={`list-${pi}`} className="mt-2">
                      {block.platforms.length > 1 && (
                        <p className="font-pixel text-[9px] uppercase text-fg-faint">
                          {/* Same arrow rule as the plan above: the arrow
                              points at the end of the platform that
                              destination lies towards. Pointing every caption
                              right made the list contradict the picture it
                              sits under. */}
                          {pf.directions
                            .map((d, di) =>
                              d === "asc"
                                ? `${pf.towards[di]} →`
                                : `← ${pf.towards[di]}`,
                            )
                            .join("   ")}
                        </p>
                      )}
                      {/* Said in HTML rather than inside the SVG, where it
                          could not wrap and overflowed the platform in any
                          language wordier than English. */}
                      {pf.features.length === 0 && (
                        <p className="mt-1 text-xs text-fg-faint">
                          {t("layout.notSurveyed")}
                        </p>
                      )}
                      <ul className="mt-1 flex flex-col gap-1">
                        {pf.features.map((lf, i) => (
                          <li
                            key={`${lf.feature.type}-${lf.doors.join("-")}-${i}`}
                            className="flex gap-2 text-xs text-fg-muted"
                          >
                            <span className="text-fg">{FEATURE_GLYPH[lf.feature.type]}</span>
                            <span>
                              {t(`mode.${lf.feature.type}` as MessageKey)}
                              {" · "}
                              {/* Two doors means one thing reached from either
                                  side of an island platform, not two things. */}
                              {lf.doors.length > 1
                                ? t("layout.doorEither", { doors: lf.doors.join(" / ") })
                                : t("layout.door", { door: lf.doors[0] })}
                              {lf.feature.leadsTo.length > 0 &&
                                ` → ${lf.feature.leadsTo.join(", ")}`}
                              {(lf.feature.secondaryFor ?? []).length > 0 &&
                                ` · ${t("layout.secondaryFor", {
                                  targets: lf.feature.secondaryFor!.join(", "),
                                })}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                ))}
              </div>
            ))}
          </div>
          {/* The glyphs mean nothing on their own, and a plan whose symbols
              have to be guessed at is a puzzle rather than a map. */}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
            {DEVICE_TYPES.map((type) => (
              <span key={type}>
                <span className="mr-1 text-fg">{FEATURE_GLYPH[type]}</span>
                {t(`mode.${type}` as MessageKey)}
              </span>
            ))}
          </p>
          {/* The completion figure belongs here, next to the plan it measures
              and one section above the button that fixes it. On the settings
              page it is a statistic; here it is a prompt. */}
          {p.coverage.length > 0 && (
            <div className="mt-4 border-t-2 border-[var(--border)] pt-3">
              {p.coverage.map((c) => {
                const done = c.exitsCovered + c.transfersCovered;
                const total = c.exitsTotal + c.transfersTotal;
                const towards = p.platforms.find(
                  (pl) => pl.direction === c.direction,
                )?.nextStop;
                return (
                  <div key={c.direction} className="mt-2">
                    <SurveyProgress
                      label={t("station.coverageTowards", { station: towards ?? c.direction })}
                      done={c.complete ? total : done}
                      total={total}
                      tone={c.complete ? "accent" : "candidate"}
                    />
                  </div>
                );
              })}
              <p className="mt-2 text-xs text-fg-faint">
                {t("station.coverageMeaning")}
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-fg-faint">{t("station.layoutNote")}</p>
        </section>
      )}

      <section className="pixel-box p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("station.doorPositions")}
        </h2>
        {/* Three genuinely different situations, which the old single message
            conflated: LRT has no fleet data so no guidance is possible at all
            and the survey tool cannot open; a couple of MRT stations have no
            exits to estimate from; the rest have estimates. Claiming
            "estimated positions are shown" where none exist was simply false,
            and the survey link 404'd on all 42 LRT stations. */}
        <p className="mt-3 text-sm leading-relaxed text-fg">
          {!p.canGiveDoorGuidance
            ? t("station.noFleetData")
            : p.hasVerified
              ? t("station.mappedDirections", { count: 1 })
              : p.hasEstimates
                ? t("station.notMapped")
                : t("station.noEstimateBasis")}
        </p>
        {p.canGiveDoorGuidance && p.platforms.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm text-fg-muted">{t("station.surveyPick")}</p>
            {/* One button per platform. Named by the next stop rather than the
                terminus, because that is what a surveyor can check against the
                strip map without trusting us to have guessed the line's end. */}
            {p.platforms.map((platform) => (
              <Link
                key={platform.direction}
                href={`/survey/${p.code}/${platform.direction}`}
                className="pixel-btn font-pixel block px-4 py-3 text-center text-xs uppercase"
              >
                {t("station.surveyTowards", { station: platform.nextStop })}
              </Link>
            ))}
          </div>
        )}
      </section>

      {exitCodes.length > 0 ? (
        <section className="pixel-box p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">
            {t("station.nearbyLandmarks")}
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {exitCodes.map((code) => (
              <ExitLandmarks key={code} code={code} items={byExit[code]} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-faint">{t("station.landmarkNote")}</p>
        </section>
      ) : (
        <section className="pixel-box p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">
            {t("station.nearbyLandmarks")}
          </h2>
          <p className="mt-3 text-sm text-fg-muted">{t("station.noLandmarks")}</p>
        </section>
      )}

      <section className="pixel-box p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("station.exits")}
        </h2>
        {p.exits.length > 0 ? (
          <>
            <ul className="mt-3 flex flex-wrap gap-2">
              {p.exits.map((code) => (
                <li key={code} className="pixel-box-sm font-pixel px-3 py-1.5 text-xs">
                  {code}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-faint">
              {t("station.exitCount", { count: p.exits.length })}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">{t("station.noExitData")}</p>
        )}
      </section>

      <section className="pixel-box p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("station.goodToKnow")}
        </h2>
        <dl className="mt-3 flex flex-col gap-3">
          {opened && (
            <div>
              <dt className="text-xs text-fg-muted">{t("station.opened")}</dt>
              <dd className="text-base text-fg">{opened}</dd>
              {p.anniversaryYears !== null && (
        <p
          className="pixel-box-sm anim-pop p-3 text-sm leading-relaxed"
          style={{ borderColor: "var(--accent)" }}
        >
          🎂 {t("egg.anniversary", { years: p.anniversaryYears })}
        </p>
      )}

      {p.interchanges.length > 0 && (
                <dd className="mt-0.5 text-xs text-fg-faint">
                  {t("station.openedNote")}
                </dd>
              )}
            </div>
          )}
          {p.train && (
            <div>
              <dt className="text-xs text-fg-muted">{t("station.trains")}</dt>
              <dd className="text-base text-fg">
                {t("station.trainLayout", {
                  cars: p.train.cars,
                  doors: p.train.doorsPerCar,
                })}
              </dd>
              {p.trainSource && (
                <dd className="mt-0.5 text-xs text-fg-faint">{p.trainSource}</dd>
              )}
            </div>
          )}
          {trivia?.depth && (
            <div>
              <dt className="text-xs text-fg-muted">{t("station.depth")}</dt>
              <dd className="text-base text-fg">{trivia.depth}</dd>
            </div>
          )}
          {trivia?.structure && (
            <div>
              <dt className="text-xs text-fg-muted">{t("station.structure")}</dt>
              <dd className="text-base text-fg">{trivia.structure}</dd>
            </div>
          )}
          {trivia?.platforms && (
            <div>
              <dt className="text-xs text-fg-muted">{t("station.platforms")}</dt>
              <dd className="text-base text-fg">{trivia.platforms}</dd>
            </div>
          )}
          {p.derived.map((f) => (
            <div key={f.labelKey}>
              <dt className="text-xs text-fg-muted">{t(f.labelKey as MessageKey)}</dt>
              <dd className="text-base text-fg"><CheckIcon /></dd>
            </div>
          ))}
        </dl>
      </section>

      <Link
        href={`/report?subject=${encodeURIComponent(`${p.code} ${p.name}`)}`}
        className="font-pixel self-start text-[11px] uppercase text-fg-muted underline"
      >
        {t("report.link")}
      </Link>

      {p.dataGaps.length > 0 && (
        <section className="pixel-box-sm p-3" style={{ borderColor: "var(--candidate)" }}>
          <h2 className="font-pixel text-xs uppercase">{t("station.dataGaps")}</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {p.dataGaps.map((g) => (
              <li key={g} className="text-xs leading-relaxed text-fg-muted">
                {t(g as MessageKey)}
              </li>
            ))}
          </ul>
        </section>
      )}
      </main>
    </div>
  );
}
