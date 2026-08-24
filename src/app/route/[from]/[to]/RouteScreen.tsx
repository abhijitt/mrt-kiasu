"use client";

import Link from "next/link";
import { useState } from "react";
import { Hud } from "@/components/Hud";
import { ExitPicker } from "@/components/ExitPicker";
import { LiftStatus } from "@/components/LiftStatus";
import { PlatformDiagram } from "@/components/PlatformDiagram";
import { toCarPosition, type Direction } from "@/lib/doors";
import { secondsSaved } from "@/lib/walking";
import { LINES, lineNameKey, type LineCode } from "@/lib/lines";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";
import type { Landmark } from "@/lib/landmark-types";
import {
  chooseExitFeature,
  type FeatureType,
  type PlatformFeature,
} from "@/lib/feature-types";

export interface LegView {
  line: LineCode;
  fromName: string;
  toName: string;
  toCode: string;
  stopNames: string[];
  direction: Direction;
  towards: string;
  /** Every recorded feature on the platform this leg ends at. */
  features: PlatformFeature[];
  /** Feature to use for the transfer, on non-final legs. */
  transferFeature: PlatformFeature | null;
}

interface Props {
  originName: string;
  destinationName: string;
  destinationCode: string;
  destinationExits: string[];
  destinationCodes: string[];
  destinationLandmarks: Landmark[];
  stopCount: number;
  interchangeCount: number;
  approxMinutes: number;
  legs: LegView[];
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

function Guidance({
  feature,
  line,
  direction,
  towards,
  preference,
  showPreferenceNote,
}: {
  feature: PlatformFeature | null;
  line: LineCode;
  direction: Direction;
  towards: string;
  preference: FeatureType;
  showPreferenceNote: boolean;
}) {
  const t = useT();
  const { settings } = useSettings();

  if (!feature) {
    return (
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        {t("route.noGuidance", { station: towards })}
      </p>
    );
  }

  const position = toCarPosition(feature.doorIndex, line, direction);
  const isEstimate = feature.confidence === "estimate";
  // Only estimates carry a metre offset, which is what the figure needs.
  const saved =
    feature.offsetM !== undefined ? secondsSaved(feature.offsetM, line) : null;
  const preferenceHonoured = feature.type === preference;
  const modeLabel = t(`mode.${preference}` as MessageKey);

  return (
    <div className="mt-4">
      {/* The answer, given the weight it deserves: this is the one thing the
          whole app exists to tell you. */}
      <div className="border-3 border-[var(--border)] bg-bg-sunken px-4 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-pixel text-[10px] uppercase tracking-wide text-fg-faint">
            {t("route.carWord")}
          </span>
          <span className="font-pixel text-4xl leading-none text-accent">
            {position.car}
          </span>
          <span className="font-pixel text-base text-fg-muted">
            / {position.totalCars}
          </span>
          {!isEstimate && (
            <span className="font-pixel ml-auto text-xs text-fg">
              {t("route.door", {
                ordinal: ORDINALS[position.doorInCar - 1] ?? position.doorInCar,
              })}
            </span>
          )}
        </div>

        <div className="mt-2">
          <PlatformDiagram
            line={line}
            direction={direction}
            highlightDoorIndex={feature.doorIndex}
            highlightWholeCar={isEstimate}
            towards={towards}
            avatar={settings.avatar}
            skinTone={settings.skinTone}
            label={t("route.car", { car: position.car, total: position.totalCars })}
            noDataLabel={t("line.noFleetData")}
          />
        </div>
      </div>

      {showPreferenceNote && (
        <p className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="pixel-box-sm px-2 py-1.5 text-xs leading-snug"
            style={
              preferenceHonoured
                ? { borderColor: "var(--verified)", color: "var(--verified)" }
                : { borderColor: "var(--candidate)" }
            }
          >
            {preferenceHonoured
              ? t("route.preferenceApplied", { mode: modeLabel })
              : t("route.preferenceUnavailable", { mode: modeLabel })}
          </span>
          <Link href="/settings" className="text-xs text-fg-muted underline">
            {t("route.changePreference")}
          </Link>
        </p>
      )}

      {saved !== null && saved > 5 && (
        <div className="pixel-box-sm mt-3 p-3">
          <p className="font-pixel text-[10px] uppercase text-fg-muted">
            {t("saved.title")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg">
            {t("saved.body", { seconds: saved })}
          </p>
          <p className="mt-1 text-xs text-fg-faint">{t("saved.caveat")}</p>
        </div>
      )}

      {isEstimate ? (
        <p className="mt-2 text-xs leading-relaxed text-fg-faint">
          <span className="font-pixel uppercase" style={{ color: "var(--candidate)" }}>
            {t("route.estimateTitle")}
          </span>{" "}
          {t("route.estimateBody", {
            exit: feature.leadsTo.length
              ? t("route.exitLabel", { code: feature.leadsTo[0] })
              : t("route.estimateExitFallback"),
          })}
        </p>
      ) : (
        <p className="mt-2 text-xs text-fg-muted">
          {feature.verifiedAt
            ? t("route.verifiedOn", { date: feature.verifiedAt })
            : t("route.verified")}
        </p>
      )}
    </div>
  );
}

export function RouteScreen(p: Props) {
  const t = useT();
  const { settings, loaded } = useSettings();
  const [selectedExit, setSelectedExit] = useState<string | null>(null);

  const preference = settings.preferredExitMode;

  return (
    <div className="min-h-dvh">
      <Hud
        title={`${p.originName} → ${p.destinationName}`}
        backHref="/"
        accentVar={p.legs[0] ? LINES[p.legs[0].line].colorVar : undefined}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-16 pt-5">
      <header>
        <div className="flex flex-wrap gap-2">
          <span className="pixel-box-sm font-pixel px-3 py-1.5 text-xs">
            {t(p.stopCount === 1 ? "route.stop" : "route.stops", { count: p.stopCount })}
          </span>
          <span className="pixel-box-sm font-pixel px-3 py-1.5 text-xs">
            {t(p.interchangeCount === 1 ? "route.change" : "route.changes", {
              count: p.interchangeCount,
            })}
          </span>
          <span className="pixel-box-sm font-pixel px-3 py-1.5 text-xs text-fg-muted">
            {t("route.approxMinutes", { count: p.approxMinutes })}
          </span>
          {selectedExit && (
            <span
              className="pixel-box-sm font-pixel px-3 py-1.5 text-xs"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {t("route.targetingExit", { code: selectedExit })}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-fg-faint">{t("route.timesApprox")}</p>
      </header>

      {p.legs.map((leg, i) => {
        const isFinalLeg = i === p.legs.length - 1;
        const nextLeg = p.legs[i + 1];
        const line = LINES[leg.line];

        const feature = isFinalLeg
          ? chooseExitFeature(leg.features, preference, selectedExit)
          : (leg.transferFeature ?? chooseExitFeature(leg.features, preference, null));

        return (
          <section key={`${leg.fromName}-${leg.toName}-${i}`} className="pixel-box anim-enter p-4">
            <div className="flex items-center gap-3">
              <span
                className="font-pixel flex h-10 w-14 shrink-0 items-center justify-center border-2 border-[var(--border)] text-[11px]"
                style={{ background: `var(${line.colorVar})`, color: `var(${line.inkVar})` }}
              >
                {line.shortName}
              </span>
              <div className="min-w-0">
                <p className="font-pixel text-xs uppercase text-fg-muted">
                  {isFinalLeg ? t("route.finalLeg") : t("route.leg", { n: i + 1 })}
                </p>
                <p className="text-base leading-snug text-fg">
                  {t(lineNameKey(leg.line) as MessageKey)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-base text-fg">
              {leg.fromName} → {leg.toName}
            </p>
            <p className="mt-1 text-sm text-fg-muted">
              {t(leg.stopNames.length === 0 ? "route.stop" : "route.stops", {
                count: leg.stopNames.length + 1,
              })}{" "}
              · {t("route.towards", { station: leg.towards })}
              {leg.stopNames.length > 0 && (
                <> · {t("route.via", { stations: leg.stopNames.join(", ") })}</>
              )}
            </p>

            <p className="font-pixel mt-4 text-xs uppercase text-fg-muted">
              {isFinalLeg
                ? t("route.standHereFor", {
                    target: t(`mode.${preference}.target` as MessageKey),
                  })
                : t("route.standHereChange", {
                    line: nextLeg ? t(lineNameKey(nextLeg.line) as MessageKey) : "",
                  })}
            </p>

            <Guidance
              feature={feature}
              line={leg.line}
              direction={leg.direction}
              towards={isFinalLeg ? leg.toName : leg.towards}
              preference={preference}
              showPreferenceNote={isFinalLeg && loaded}
            />
          </section>
        );
      })}

      <section className="pixel-box p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">{t("lift.title")}</h2>
        <LiftStatus
          stationCodes={p.destinationCodes}
          stationName={p.destinationName}
          emphasise
        />
      </section>

      <section className="pixel-box p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("exit.chooseHeading")}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          {t("route.exitsAt", { station: p.destinationName })}
        </p>
        <div className="mt-3">
          {p.destinationExits.length > 0 ? (
            <ExitPicker
              exits={p.destinationExits}
              landmarks={p.destinationLandmarks}
              selected={selectedExit}
              onSelect={setSelectedExit}
            />
          ) : (
            <p className="text-sm text-fg-muted">{t("route.noExits")}</p>
          )}
        </div>
        <Link
          href={`/station/${p.destinationCode}`}
          className="pixel-btn font-pixel mt-4 block px-4 py-3 text-center text-xs uppercase"
        >
          {t("route.aboutStation", { station: p.destinationName })}
        </Link>
      </section>
        <Link
          href={`/report?subject=${encodeURIComponent(`${p.originName} → ${p.destinationName}`)}`}
          className="font-pixel self-start text-[11px] uppercase text-fg-muted underline"
        >
          {t("report.link")}
        </Link>
      </main>
    </div>
  );
}
