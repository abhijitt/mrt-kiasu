"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Hud } from "@/components/Hud";
import { ExitPicker } from "@/components/ExitPicker";
import { LiftStatus, usePrefersLift } from "@/components/LiftStatus";
import { PlatformDiagram } from "@/components/PlatformDiagram";
import { toCarPosition, type Direction } from "@/lib/doors";
import { secondsSaved } from "@/lib/walking";
import { backupDoor, doorBreakdown, fleetSource, savedWorking } from "@/lib/gao";
import { useKiasuScore } from "@/lib/useKiasuScore";
import { JourneyEstimate } from "@/components/JourneyEstimate";
// fare-types, not fare: this is a client component, and fare.ts imports the
// 350 KB pair table. The server has already worked the fare out.
import { formatDistance, formatFare, type Fare } from "@/lib/fare-types";
import type { JourneyPayload } from "@/lib/journey-data";
import { LINES, type LineCode } from "@/lib/lines";
import { useT, type Translate } from "@/i18n/I18nProvider";
import { useLineName } from "@/i18n/useLineName";
import type { MessageKey } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";
import type { Landmark } from "@/lib/landmark-types";
import {
  chooseFeature,
  DEVICE_TYPES,
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
  /** Which side the doors open where this leg ends. Null when unverified. */
  doorSide: { side: "left" | "right"; surveyed: boolean; layout: string | null } | null;
  /** Which side they open where it begins — this orients the diagram. */
  boardingSide: "left" | "right" | null;
}

interface Props {
  /** Everything needed to time this journey against the real timetable. */
  journey: JourneyPayload;
  /**
   * Adult card fare, priced on the server. Null when we hold no distance for
   * the pair, in which case the cost is simply not shown — the app does not
   * guess at money.
   */
  fare: Fare | null;
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

/**
 * Names a fare band the way the PTC table does: "up to 3.2 km", "3.3-4.2 km",
 * "over 40.2 km". Three shapes rather than one string, because a translator
 * needs to move the words around the numbers.
 */
function bandLabel(band: Fare["band"], t: Translate): string {
  if (band.toKm === null) return t("fare.bandOver", { from: band.fromKm });
  if (band.fromKm === 0) return t("fare.bandUpTo", { to: band.toKm });
  return t("fare.bandRange", { from: band.fromKm, to: band.toKm });
}

function Guidance({
  feature,
  line,
  direction,
  towards,
  preference,
  showPreferenceNote,
  targetMissed,
  legKey,
  doorSide,
  arrivalDoor,
}: {
  feature: PlatformFeature | null;
  line: LineCode;
  direction: Direction;
  towards: string;
  preference: FeatureType;
  showPreferenceNote: boolean;
  /**
   * The exit or line we were asked for but found nothing recorded for, already
   * labelled for display. Null when we matched it, or when none was asked for.
   */
  targetMissed: string | null;
  /** Identifies this leg, so revisiting a route does not count it twice. */
  legKey: string;
  /** Which side the doors open where you board — it orients the diagram. */
  doorSide?: "left" | "right";
  /** The arrival note, rendered under the diagram it refers to. */
  arrivalDoor?: React.ReactNode;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { record } = useKiasuScore();

  // Above the early return, because hooks must run in the same order on every
  // render. The figure is recomputed here rather than reused below so this
  // does not depend on where the render happens to bail out.
  const savedForScore =
    feature?.offsetM !== undefined ? secondsSaved(feature.offsetM, line) : null;

  useEffect(() => {
    if (savedForScore !== null && savedForScore > 0) record(savedForScore);
    // Keyed on the leg alone: a re-render from a settings tweak or a language
    // switch must not count the same walk again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legKey]);

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
  // What we are actually sending them to, when it is a device at all. An
  // estimate is a position rather than a thing, so it has no name here and
  // falls through to the wording about unsurveyed platforms.
  const actualDevice = (DEVICE_TYPES as readonly FeatureType[]).includes(feature.type)
    ? t(`mode.${feature.type}.target` as MessageKey)
    : null;

  // Gao only ever adds. Everything above this line renders identically at
  // either level, so turning the setting on cannot change an existing answer.
  const gao = settings.kiasuLevel === "gao";
  const breakdown = gao ? doorBreakdown(feature.doorIndex, line, direction) : null;
  const working = gao && feature.offsetM !== undefined ? savedWorking(feature.offsetM, line) : null;
  const backup = gao && !isEstimate ? backupDoor(feature.doorIndex, line) : null;
  const backupPosition = backup ? toCarPosition(backup.doorIndex, line, direction) : null;

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

        {breakdown && !isEstimate && (
          <p className="mt-1 text-xs text-fg-faint">
            {t("gao.doorIndex", {
              index: breakdown.fromFront,
              total: breakdown.total,
              // Always the front: doorBreakdown has already applied direction,
              // so fromFront is measured from the nose of the moving train
              // whichever way it happens to be pointing.
              end: t("gao.endFront"),
            })}
          </p>
        )}

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
            doorSide={doorSide}
          />
        </div>

        {/* Under the picture it describes: it is a caption on the diagram, not
            a separate announcement competing with the car number above it. */}
        {arrivalDoor}
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
              : actualDevice
                ? // The platform IS surveyed — it just has something else on
                  // it. Saying "needs a surveyed platform" here would be false.
                  t("route.preferenceOther", { mode: modeLabel, actual: actualDevice })
                : t("route.preferenceUnavailable", { mode: modeLabel })}
          </span>
          <Link href="/settings" className="text-xs text-fg-muted underline">
            {t("route.changePreference")}
          </Link>
        </p>
      )}

      {/* Refusing to imply a targeted answer. Several escalators can sit on one
          platform serving different places; if none is recorded as serving the
          one you asked for, picking the first is a guess and is labelled one. */}
      {targetMissed && (
        // The paragraph IS the box. A bordered <span> is inline, so its border
        // splits down the middle when the text wraps — which this text always
        // does on a phone. Every other box in here escapes that by sitting in
        // a flex parent; this one has no siblings to justify one.
        <p
          className="pixel-box-sm mt-3 px-2 py-1.5 text-xs leading-snug"
          style={{ borderColor: "var(--candidate)" }}
        >
          {t("route.targetUnknown", { target: targetMissed })}
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

      {working && (
        <div className="pixel-box-sm mt-3 p-3">
          <p className="font-pixel text-[10px] uppercase text-fg-muted">
            {t("gao.workingTitle")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg">
            {t("gao.workingBody", {
              length: working.lengthM,
              half: working.halfM,
              offset: Math.abs(working.offsetM),
              saved: working.savedM,
              speed: working.speedMs,
            })}
          </p>
          {working.rawOffsetM !== undefined && (
            <p className="mt-1 text-xs leading-relaxed text-fg-faint">
              {t("gao.clamped", { raw: Math.abs(working.rawOffsetM), half: working.halfM })}
            </p>
          )}
        </div>
      )}

      {backup && backupPosition && (
        <div className="pixel-box-sm mt-3 p-3">
          <p className="font-pixel text-[10px] uppercase text-fg-muted">
            {t("gao.backupTitle")}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg">
            {t("gao.backupBody", {
              car: backupPosition.car,
              ordinal: ORDINALS[backupPosition.doorInCar - 1] ?? backupPosition.doorInCar,
              loss: backup.extraSeconds,
            })}
          </p>
        </div>
      )}

      {gao && fleetSource(line) && (
        <div className="pixel-box-sm mt-3 p-3">
          <p className="font-pixel text-[10px] uppercase text-fg-muted">
            {t("gao.sourceTitle")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-fg-faint">
            {fleetSource(line)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-fg-faint">
            {feature.sourceNote}
          </p>
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
  const lineName = useLineName();
  const { settings, loaded } = useSettings();
  const [selectedExit, setSelectedExit] = useState<string | null>(null);

  const preference = settings.preferredExitMode;
  const prefersLift = usePrefersLift();
  const gao = settings.kiasuLevel === "gao";

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
          {selectedExit && (
            <span
              className="pixel-box-sm font-pixel px-3 py-1.5 text-xs"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {t("route.targetingExit", { code: selectedExit })}
            </span>
          )}
        </div>
        {p.fare && (
          <div className="pixel-box anim-enter mt-3 p-4">
            <p className="font-pixel text-[10px] uppercase text-fg-muted">
              {t("fare.title")}
            </p>
            <p className="mt-2 text-base leading-relaxed text-fg">
              {t("fare.amount", { amount: formatFare(p.fare.cents) })}
            </p>
            {/* The distance is the whole basis of the price, and it is the part
                a commuter can sanity-check against the map on the wall. */}
            <p className="mt-1 text-sm text-fg-muted">
              {t("fare.basis", { distance: formatDistance(p.fare.units) })}
            </p>
            {/* Gao shows the band the distance landed in and where each half of
                the sum came from. It asserts nothing new — the fare above is
                already this arithmetic, just not shown. */}
            {gao && (
              <div className="pixel-box-sm mt-3 p-3">
                <p className="font-pixel text-[10px] uppercase text-fg-muted">
                  {t("gao.workingTitle")}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-fg">
                  {t("fare.gaoBody", {
                    distance: formatDistance(p.fare.units),
                    band: bandLabel(p.fare.band, t),
                    amount: formatFare(p.fare.cents),
                  })}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fg-faint">
                  {t("fare.gaoSource", { effective: p.fare.effective })}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-3">
          <JourneyEstimate
            legs={p.journey.legs}
            hops={p.journey.hops}
            hopSeconds={p.journey.hopSeconds}
            dwellSeconds={p.journey.dwellSeconds}
            departures={p.journey.departures}
            day={p.journey.day}
            transferWalkMinutes={p.journey.transferWalkMinutes}
            transferMeasured={p.journey.transferMeasured}
          />
        </div>
      </header>

      {p.legs.map((leg, i) => {
        const isFinalLeg = i === p.legs.length - 1;
        const nextLeg = p.legs[i + 1];
        const line = LINES[leg.line];

        // One axis. On the last leg you are heading for an exit; at an
        // interchange you are heading for the next line. The data no longer
        // distinguishes the two, so neither does the lookup — an escalator
        // recorded as serving both is found by either question.
        const target = isFinalLeg ? selectedExit : (nextLeg?.line ?? null);
        const targeted = target ? chooseFeature(leg.features, preference, target) : null;
        const feature = targeted ?? chooseFeature(leg.features, preference, null);
        const targetMissed =
          target && !targeted && feature
            ? isFinalLeg
              ? t("route.exitLabel", { code: target })
              : lineName(target as LineCode)
            : null;

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
                  {lineName(leg.line)}
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
                    line: nextLeg ? lineName(nextLeg.line) : "",
                  })}
            </p>

            <Guidance
              feature={feature}
              line={leg.line}
              direction={leg.direction}
              towards={isFinalLeg ? leg.toName : leg.towards}
              preference={preference}
              showPreferenceNote={loaded}
              targetMissed={targetMissed}
              legKey={`${p.originName}|${p.destinationName}|${i}`}
              doorSide={leg.boardingSide ?? undefined}
              arrivalDoor={
                settings.kiasuLevel === "gao" && leg.doorSide ? (
                  <p
                    className="mt-2 px-1 text-xs leading-relaxed text-fg-muted"
                    title={
                      leg.doorSide.surveyed
                        ? t("doors.surveyed")
                        : leg.doorSide.layout
                          ? t("doors.implied", {
                              layout: t(`layout.${leg.doorSide.layout}` as MessageKey),
                            })
                          : undefined
                    }
                  >
                    <span style={{ color: "var(--verified)" }}>
                      {t(leg.doorSide.side === "left" ? "doors.left" : "doors.right")}
                    </span>{" "}
                    {t("doors.onArrival", { station: leg.toName })}
                  </p>
                ) : null
              }
            />
          </section>
        );
      })}

      {/* The heading goes with it. LiftStatus renders nothing unless the lift
          is your preference, and a bare "Lift status" box with no status under
          it reads as broken rather than as not applicable. */}
      {prefersLift && (
        <section className="pixel-box p-4">
          <h2 className="font-pixel text-xs uppercase text-fg-muted">{t("lift.title")}</h2>
          <LiftStatus
            stationCodes={p.destinationCodes}
            stationName={p.destinationName}
            emphasise
          />
        </section>
      )}

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
