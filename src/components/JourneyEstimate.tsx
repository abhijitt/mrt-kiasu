"use client";

import { useId, useMemo, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";
import { estimateJourneyExact, type DepartureTable, type Leg } from "@/lib/journey-time";
import { durationShape, splitDuration } from "@/lib/duration";
import type { MessageKey, Translate } from "@/i18n/I18nProvider";
import { formatDistance, formatFare, type Fare, type FarePrice } from "@/lib/fare-types";

interface Props {
  legs: Leg[];
  hops: Record<string, number>;
  hopSeconds: Record<string, number>;
  dwellSeconds: Record<string, number>;
  departures: DepartureTable;
  day: "weekday" | "saturday" | "sunday";
  transferWalkMinutes: number;
  transferMeasured: boolean;
  /** Priced on the server. Null when we hold no distance for the pair. */
  fare: Fare | null;
}

/**
 * Names a fare band the way the PTC table does: "up to 3.2 km", "3.3-4.2 km",
 * "over 40.2 km". Three shapes rather than one string, because a translator
 * needs to move the words around the numbers.
 */
function bandLabel(band: FarePrice["band"], t: Translate): string {
  if (band.toKm === null) return t("fare.bandOver", { from: band.fromKm });
  if (band.fromKm === 0) return t("fare.bandUpTo", { to: band.toKm });
  return t("fare.bandRange", { from: band.fromKm, to: band.toKm });
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
 * The trip in one card: how long it takes and what it costs.
 *
 * One card rather than two, because they answer the same question — "what am
 * I in for" — and a commuter reads them together.
 *
 * Kopi is the two figures and nothing else; someone standing on a platform
 * wants the answer, not the derivation. Gao adds a departure time, and a "?"
 * that opens the working: the breakdown, what the fare was charged on, and
 * where each number came from.
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
  const [showDetails, setShowDetails] = useState(false);
  // Which card they tap. Every type was priced on the server, so switching is
  // a lookup rather than a round trip.
  const price = props.fare?.byType[settings.fareType] ?? null;
  const detailsId = useId();
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

  // Hoisted so the button can sit on the fare line — where there is a fare —
  // and on its own row where there is not. A journey we cannot price still
  // has timings worth explaining.
  const detailsToggle = gao ? (
    <button
      type="button"
      onClick={() => setShowDetails((open) => !open)}
      aria-expanded={showDetails}
      aria-controls={detailsId}
      aria-label={t("trip.detailsLabel")}
      className="pixel-btn font-pixel min-h-11 w-11 shrink-0 text-[13px]"
    >
      ?
    </button>
  ) : null;

  const detailsPanel =
    gao && showDetails ? (
      <div id={detailsId} className="pixel-box-sm mt-2 flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-1 text-sm text-fg-muted">
          <span>{t("journey.ride", { duration: duration(journey.rideMinutes) })}</span>
          <span>{t("journey.wait", { duration: duration(journey.waitMinutes) })}</span>
          {journey.walkMinutes > 0 && (
            <span>
              {t("journey.walk", { duration: duration(journey.walkMinutes) })}
              {!props.transferMeasured && ` — ${t("transfer.assumed")}`}
            </span>
          )}
        </div>

        <p className="text-xs leading-relaxed text-fg-faint">
          {journey.approximated ? t("journey.approximated") : t("journey.source")}
        </p>

        {props.fare && price && (
          <div className="flex flex-col gap-1">
            <p className="text-sm leading-relaxed text-fg-muted">
              {t("fare.basis", { distance: formatDistance(props.fare.units) })}
            </p>
            <p className="text-sm leading-relaxed text-fg-muted">
              {t("fare.gaoBody", {
                distance: formatDistance(props.fare.units),
                band: bandLabel(price.band, t),
                amount: formatFare(price.cents),
              })}
            </p>
            <p className="text-xs leading-relaxed text-fg-faint">
              {t("fare.gaoSource", { effective: props.fare.effective })}
            </p>
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className="pixel-box anim-enter p-4">
      <p className="font-pixel text-[10px] uppercase text-fg-muted">{t("trip.title")}</p>

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

      {price ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-base leading-relaxed text-fg">
              {t("fare.amount", {
                amount: formatFare(price.cents),
                type: t(`fareType.${settings.fareType}.inline` as MessageKey),
              })}
            </p>
            {detailsToggle}
          </div>
          {detailsPanel}
        </>
      ) : (
        gao && (
          <div className="mt-3">
            {detailsToggle}
            {detailsPanel}
          </div>
        )
      )}

      {gao && (
        <>
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
              // appearance-none and rounded-none because a time input carries
              // heavy user-agent styling: Safari and iOS draw their own rounded
              // control inside our square 2px box, so the border reads as
              // broken where the two disagree. min-h keeps the box the same
              // height as the buttons around it once the UA chrome is gone.
              className="pixel-box-sm mt-2 block min-h-12 w-full appearance-none rounded-none bg-bg-raised px-3 py-3 text-base text-fg"
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
    </div>
  );
}
