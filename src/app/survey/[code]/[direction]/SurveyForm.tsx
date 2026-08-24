"use client";

import { useState } from "react";
import { PlatformDiagram } from "@/components/PlatformDiagram";
import { toCarPosition, type Direction } from "@/lib/doors";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";
import type { LineCode } from "@/lib/lines";
import type { FeatureType, PlatformFeature, Travel } from "@/lib/feature-types";

const TYPES: FeatureType[] = ["escalator", "lift", "stairs", "transfer"];
const TRAVELS: Travel[] = ["up", "reversible", "down"];
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

interface Props {
  stationCode: string;
  stationName: string;
  line: LineCode;
  direction: Direction;
  totalDoors: number;
  exitCodes: string[];
  interchanges: string[];
  existing: PlatformFeature[];
  towards: string;
}

/** One numbered step of the survey, so the flow reads as a sequence. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pixel-box anim-enter p-4">
      <div className="flex items-center gap-3">
        <span className="font-pixel flex h-7 w-7 shrink-0 items-center justify-center border-2 border-[var(--border)] bg-accent text-[10px] text-[var(--accent-fg)]">
          {n}
        </span>
        <h2 className="font-pixel text-xs uppercase text-fg">{title}</h2>
      </div>
      {hint && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="pixel-btn font-pixel px-2 py-3 text-[10px] uppercase leading-tight"
      style={active ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined}
    >
      {children}
    </button>
  );
}

export function SurveyForm({
  stationCode,
  stationName,
  line,
  direction,
  totalDoors,
  exitCodes,
  interchanges,
  existing,
  towards,
}: Props) {
  const t = useT();
  const { settings } = useSettings();
  const [doorIndex, setDoorIndex] = useState<number | null>(null);
  const [type, setType] = useState<FeatureType>("escalator");
  const [travel, setTravel] = useState<Travel>("up");
  const [leadsTo, setLeadsTo] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);

  const targets = type === "transfer" ? interchanges : exitCodes;
  const position = doorIndex != null ? toCarPosition(doorIndex, line, direction) : null;

  function toggleTarget(target: string) {
    setLeadsTo((prev) =>
      prev.includes(target) ? prev.filter((x) => x !== target) : [...prev, target],
    );
  }

  function nudge(delta: number) {
    setDoorIndex((prev) => {
      const next = (prev ?? 1) + delta;
      return Math.min(totalDoors, Math.max(1, next));
    });
  }

  function describeDoor(idx: number): string {
    const pos = toCarPosition(idx, line, direction);
    return `${t("route.car", { car: pos.car, total: pos.totalCars })} · ${t("route.door", {
      ordinal: ORDINALS[pos.doorInCar - 1] ?? pos.doorInCar,
    })}`;
  }

  async function save() {
    if (doorIndex == null) return;

    const feature: PlatformFeature = {
      type,
      doorIndex,
      leadsTo,
      source: "survey",
      confidence: "verified",
      verifiedAt: new Date().toISOString().slice(0, 10),
      sourceNote: `Field survey at ${stationName}`,
      // Only escalators have a meaningful direction; stairs and lifts serve both.
      ...(type === "escalator" ? { travel } : {}),
    };

    const json = JSON.stringify({ stationCode, direction, feature }, null, 2);

    setStatus(t("survey.saving"));
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
      });
      const body = await res.json();
      if (res.ok) {
        setStatus(t("survey.saved", { count: body.count }));
        setPayload(null);
      } else if (res.status === 403) {
        // Production: hand the surveyor the JSON to submit for review.
        setStatus(t("survey.disabled"));
        setPayload(json);
      } else {
        setStatus(t("survey.rejected", { reason: body.details?.join("; ") ?? body.error }));
        setPayload(null);
      }
    } catch {
      setStatus(t("survey.offline"));
      setPayload(json);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Step n={1} title={t("survey.step1")} hint={t("survey.tapHint")}>
        {/* The train IS the input. Reading "3.2" off a grid of 24 buttons and
            mapping it onto the train in front of you is exactly the translation
            step a surveyor should not have to do. */}
        <div className="border-3 border-[var(--border)] bg-bg-sunken p-2">
          <PlatformDiagram
            line={line}
            direction={direction}
            features={existing}
            highlightDoorIndex={doorIndex ?? undefined}
            towards={towards}
            avatar={doorIndex != null ? settings.avatar : undefined}
            skinTone={settings.skinTone}
            fitWidth
            onSelectDoor={setDoorIndex}
            doorLabel={describeDoor}
            label={t("survey.step1")}
            noDataLabel={t("line.noFleetData")}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={t("survey.nudgePrev")}
            className="pixel-btn flex h-11 w-11 shrink-0 items-center justify-center text-lg"
          >
            ‹
          </button>
          <p className="font-pixel flex-1 text-center text-[11px] leading-relaxed text-accent">
            {position
              ? describeDoor(doorIndex!)
              : <span className="text-fg-faint">{t("survey.nothingSelected")}</span>}
          </p>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={t("survey.nudgeNext")}
            className="pixel-btn flex h-11 w-11 shrink-0 items-center justify-center text-lg"
          >
            ›
          </button>
        </div>
      </Step>

      <Step n={2} title={t("survey.step2")}>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((id) => (
            <Choice
              key={id}
              active={type === id}
              onClick={() => {
                setType(id);
                setLeadsTo([]);
              }}
            >
              {t(`mode.${id}` as MessageKey)}
            </Choice>
          ))}
        </div>
      </Step>

      {type === "escalator" && (
        <Step n={3} title={t("survey.travelHeading")} hint={t("survey.travelHint")}>
          <div className="grid grid-cols-3 gap-2">
            {TRAVELS.map((dir) => (
              <Choice key={dir} active={travel === dir} onClick={() => setTravel(dir)}>
                {t(`travel.${dir}` as MessageKey)}
              </Choice>
            ))}
          </div>
        </Step>
      )}

      <Step
        n={type === "escalator" ? 4 : 3}
        title={`${t("survey.step3")}${type !== "transfer" ? ` ${t("survey.optional")}` : ""}`}
      >
        {targets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {targets.map((target) => (
              <Choice
                key={target}
                active={leadsTo.includes(target)}
                onClick={() => toggleTarget(target)}
              >
                {type === "transfer" ? target : t("route.exitLabel", { code: target })}
              </Choice>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            {type === "transfer" ? t("survey.noInterchanges") : t("survey.noExits")}
          </p>
        )}
      </Step>

      <button
        type="button"
        onClick={save}
        disabled={doorIndex == null}
        className="pixel-btn font-pixel px-4 py-4 text-xs uppercase"
        style={
          doorIndex != null
            ? { background: "var(--accent)", color: "var(--accent-fg)" }
            : undefined
        }
      >
        {t("survey.save")}
      </button>

      {status && (
        <p className="pixel-box-sm p-3 text-sm leading-relaxed" role="status">
          {status}
        </p>
      )}
      {payload && (
        <pre className="pixel-box-sm overflow-x-auto p-3 text-[10px] leading-relaxed">
          {payload}
        </pre>
      )}
    </div>
  );
}
