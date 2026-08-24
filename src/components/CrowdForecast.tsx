"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";

type Level = "l" | "m" | "h" | "NA";

interface Interval {
  Start: string;
  CrowdLevel: Level;
}

interface ForecastStation {
  Station: string;
  Interval: Interval[];
}

interface ForecastDay {
  Date: string;
  Stations: ForecastStation[];
}

const COLOR: Record<Level, string> = {
  l: "var(--crowd-l)",
  m: "var(--crowd-m)",
  h: "var(--crowd-h)",
  NA: "var(--crowd-na)",
};

const HEIGHT: Record<Level, string> = {
  l: "35%",
  m: "65%",
  h: "100%",
  NA: "12%",
};

/** How far ahead is useful to plan. Beyond this the reader stops caring. */
const HOURS_AHEAD = 4;

/**
 * Today's crowding forecast for one station.
 *
 * The app could already tell you where to stand but never when to go, despite
 * LTA publishing a half-hourly forecast we were fetching and discarding. For a
 * commuter deciding whether to leave now, "wait twelve minutes" is often the
 * more valuable answer.
 */
export function CrowdForecast({
  stationCode,
  line,
}: {
  stationCode: string;
  line: string;
}) {
  const { t, locale } = useI18n();
  const [intervals, setIntervals] = useState<Interval[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lta/forecast?line=${line}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.configured) {
          setState("unavailable");
          return;
        }
        const days = json.forecast as ForecastDay[];
        const match = days
          ?.flatMap((d) => d.Stations ?? [])
          .find((s) => s.Station === stationCode);
        setIntervals(match?.Interval ?? null);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [stationCode, line]);

  const upcoming = useMemo(() => {
    if (!intervals) return [];
    const now = Date.now();
    return intervals
      .map((i) => ({ ...i, at: new Date(i.Start).getTime() }))
      .filter((i) => !Number.isNaN(i.at))
      // Keep the slot we're inside plus the next few hours.
      .filter((i) => i.at >= now - 30 * 60 * 1000)
      .sort((a, b) => a.at - b.at)
      .slice(0, HOURS_AHEAD * 2);
  }, [intervals]);

  const quietest = useMemo(() => {
    const low = upcoming.filter((i) => i.CrowdLevel === "l");
    return low.length > 0 ? low[0] : null;
  }, [upcoming]);

  if (state === "loading") {
    return <p className="mt-3 text-sm text-fg-faint">{t("crowd.checking")}</p>;
  }
  if (state === "unavailable" || upcoming.length === 0) {
    return <p className="mt-3 text-sm text-fg-muted">{t("forecast.unavailable")}</p>;
  }

  // 24-hour, so labels stay one short line and the bars keep a shared baseline.
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString(locale === "en" ? "en-GB" : locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  return (
    <div className="mt-3">
      {/* Bars and labels are separate rows: nesting the labels inside each
          column let a wrapped label shove its bar off the shared baseline. */}
      <div className="flex h-16 items-end gap-1" role="img" aria-label={t("forecast.title")}>
        {upcoming.map((i) => (
          <div
            key={i.Start}
            className="flex-1 border-2 border-[var(--border)]"
            style={{ height: HEIGHT[i.CrowdLevel], background: COLOR[i.CrowdLevel] }}
            title={`${fmt(i.at)} · ${t(
              `crowd.${
                i.CrowdLevel === "l"
                  ? "low"
                  : i.CrowdLevel === "m"
                    ? "medium"
                    : i.CrowdLevel === "h"
                      ? "high"
                      : "na"
              }`,
            )}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {upcoming.map((i, idx) => (
          <span
            key={i.Start}
            className="font-pixel flex-1 overflow-hidden text-center text-[8px] whitespace-nowrap text-fg-faint"
          >
            {idx === 0 ? t("forecast.now") : idx % 2 === 0 ? fmt(i.at) : ""}
          </span>
        ))}
      </div>

      {quietest && (
        <p className="font-pixel mt-3 text-[11px]" style={{ color: "var(--crowd-l)" }}>
          {t("forecast.quietest", { time: fmt(quietest.at) })}
        </p>
      )}
      <p className="mt-2 text-xs text-fg-faint">{t("forecast.note")}</p>
    </div>
  );
}
