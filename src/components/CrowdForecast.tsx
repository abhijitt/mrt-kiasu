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

/** Bar height as a fraction of what a "high" bar gets. */
const LEVEL: Record<Level, number> = {
  l: 0.35,
  m: 0.65,
  h: 1,
  NA: 0.12,
};

/**
 * Plot height in pixels for a window whose busiest moment is "high".
 *
 * The plot used to be this tall always, with the bars anchored to the bottom.
 * That is right for a busy afternoon and wrong the rest of the time: four
 * quiet hours drew 22px of bar under 42px of reserved emptiness, and after the
 * crowd sections merged that void sat directly under the "Later" heading and
 * read as a rendering fault.
 *
 * So the plot is only as tall as the busiest moment in the window needs. Bars
 * keep their proportions to each other, which is what the chart is for — when
 * does it get worse — and the absolute level is carried by the colour, which
 * does not change. A flat quiet stretch draws a short strip, which is honest
 * about being flat and quiet.
 */
const PLOT_H = 64;

/** Shortest the plot may get, so an all-quiet window is still a chart. */
const PLOT_MIN = 26;

const peakOf = (levels: Level[]) => Math.max(...levels.map((l) => LEVEL[l]));

/** How tall to draw the plot for one window of levels, in pixels. */
export function plotHeight(levels: Level[]): number {
  if (levels.length === 0) return PLOT_MIN;
  return Math.max(PLOT_MIN, Math.round(PLOT_H * peakOf(levels)));
}

/**
 * One bar's share of the plot, as a percentage.
 *
 * Relative to the busiest moment in the same window, so the shape of the
 * afternoon survives the plot being shortened — which is the part of the chart
 * anyone reads. Where the window is quiet enough that PLOT_MIN takes over, the
 * bars are a little taller than their absolute share; the colour still says
 * which level each one is.
 */
export function barShare(level: Level, levels: Level[]): number {
  if (levels.length === 0) return 0;
  return (LEVEL[level] / peakOf(levels)) * 100;
}

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
  // When the forecast above was fetched, so filtering stays pure across renders.
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
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
        // Stamped here rather than read during render: Date.now() in a render
        // makes the output depend on when React happens to re-render. The
        // forecast is filtered relative to when it was fetched, which is both
        // pure and what the reader is actually being shown.
        setFetchedAt(Date.now());
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
    if (!intervals || fetchedAt === null) return [];
    const now = fetchedAt;
    return intervals
      .map((i) => ({ ...i, at: new Date(i.Start).getTime() }))
      .filter((i) => !Number.isNaN(i.at))
      // Keep the slot we're inside plus the next few hours.
      .filter((i) => i.at >= now - 30 * 60 * 1000)
      .sort((a, b) => a.at - b.at)
      .slice(0, HOURS_AHEAD * 2);
  }, [intervals, fetchedAt]);

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

  const levels = upcoming.map((i) => i.CrowdLevel);

  return (
    <div className="mt-3">
      {/* Bars and labels are separate rows: nesting the labels inside each
          column let a wrapped label shove its bar off the shared baseline. */}
      <div
        className="flex items-end gap-1"
        style={{ height: plotHeight(levels) }}
        role="img"
        aria-label={t("forecast.title")}
      >
        {upcoming.map((i) => (
          <div
            key={i.Start}
            className="flex-1 border-2 border-[var(--border)]"
            style={{
              height: `${barShare(i.CrowdLevel, levels)}%`,
              background: COLOR[i.CrowdLevel],
            }}
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
