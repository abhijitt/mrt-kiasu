"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";
import { estimateJourneyExact, type DepartureTable, type Leg } from "@/lib/journey-time";
import { durationShape, splitDuration } from "@/lib/duration";
import type { MessageKey } from "@/i18n/I18nProvider";

interface Props {
  legs: Leg[];
  hops: Record<string, number>;
  hopSeconds: Record<string, number>;
  dwellSeconds: Record<string, number>;
  departures: DepartureTable;
  day: "weekday" | "saturday" | "sunday";
  transferWalkMinutes: number;
  transferMeasured: boolean;
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * How long the journey takes, walked against the real timetable.
 *
 * Kopi answers one question — leaving now — because that is what someone
 * standing on a platform is asking. Gao adds a departure time and the
 * breakdown, since choosing when to leave is planning rather than commuting.
 */
export function JourneyEstimate(props: Props) {
  const t = useT();

  /** "4 hr 46 min" rather than "286 min", which nobody converts in their head. */
  function duration(totalMinutes: number): string {
    const { hours, minutes } = splitDuration(totalMinutes);
    return t(`dur.${durationShape(totalMinutes)}` as MessageKey, { hours, minutes });
  }
  const { settings } = useSettings();
  const gao = settings.kiasuLevel === "gao";

  const [departAt, setDepartAt] = useState<number | null>(null);
  const start = departAt ?? nowMinutes();

  const journey = useMemo(
    () =>
      estimateJourneyExact({
        legs: props.legs,
        hops: props.hops,
        hopSeconds: props.hopSeconds,
        dwellSeconds: props.dwellSeconds,
        departures: props.departures,
        day: props.day,
        arriveAt: start,
        transferWalkMinutes: props.transferWalkMinutes,
      }),
    [props, start],
  );

  return (
    <div className="pixel-box anim-enter p-4">
      <p className="font-pixel text-[10px] uppercase text-fg-muted">
        {t("journey.title")}
      </p>

      <p className="mt-2 text-base leading-relaxed text-fg">
        {t("journey.total", { duration: duration(journey.total), arrive: hhmm(journey.arriveMinutes) })}
      </p>

      {journey.waitsPerLeg[0] !== undefined && (
        <p className="mt-1 text-sm text-fg-muted">
          {t("journey.firstTrain", {
            duration: duration(journey.waitsPerLeg[0]),
            at: hhmm(journey.boardTimes[0]),
          })}
        </p>
      )}

      {gao && (
        <>
          <div className="mt-3 flex flex-col gap-1 text-sm text-fg-muted">
            <span>{t("journey.ride", { duration: duration(journey.rideMinutes) })}</span>
            <span>{t("journey.wait", { duration: duration(journey.waitMinutes) })}</span>
            {journey.walkMinutes > 0 && (
              <span>
                {t("journey.walk", { duration: duration(journey.walkMinutes) })}
                {!props.transferMeasured && ` — ${t("transfer.assumed")}`}
              </span>
            )}
          </div>

          <label className="mt-4 block">
            <span className="font-pixel text-[10px] uppercase text-fg-muted">
              {t("journey.leaveAt")}
            </span>
            <input
              type="time"
              value={hhmm(start)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                if (Number.isFinite(h) && Number.isFinite(m)) setDepartAt(h * 60 + m);
              }}
              className="pixel-box-sm mt-2 w-full bg-bg-raised px-3 py-3 text-base text-fg"
            />
          </label>
          {departAt !== null && (
            <button
              type="button"
              onClick={() => setDepartAt(null)}
              className="pixel-btn font-pixel mt-2 min-h-11 px-3 py-3 text-[11px] uppercase"
            >
              {t("journey.now")}
            </button>
          )}
        </>
      )}

      <p className="mt-2 text-xs leading-relaxed text-fg-faint">
        {journey.approximated ? t("journey.approximated") : t("journey.source")}
      </p>
    </div>
  );
}
