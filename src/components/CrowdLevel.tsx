"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";

interface Reading {
  Station: string;
  StartTime: string;
  EndTime: string;
  CrowdLevel: "l" | "m" | "h" | "NA";
}

const LABEL_KEY: Record<Reading["CrowdLevel"], MessageKey> = {
  l: "crowd.low",
  m: "crowd.medium",
  h: "crowd.high",
  NA: "crowd.na",
};

const COLOR: Record<Reading["CrowdLevel"], string> = {
  l: "var(--crowd-l)",
  m: "var(--crowd-m)",
  h: "var(--crowd-h)",
  NA: "var(--crowd-na)",
};

export function CrowdLevel({
  stationCode,
  line,
}: {
  stationCode: string;
  line: string;
}) {
  const t = useT();
  const [reading, setReading] = useState<Reading | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lta/crowd?line=${line}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.configured) {
          setState("unavailable");
          return;
        }
        const match = (json.readings as Reading[]).find((r) => r.Station === stationCode);
        setReading(match ?? null);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [stationCode, line]);

  if (state === "loading") {
    return <p className="mt-3 text-sm text-fg-faint">{t("crowd.checking")}</p>;
  }
  if (state === "unavailable" || !reading) {
    return (
      <p className="mt-3 text-sm text-fg-muted">{t("crowd.unavailable")}</p>
    );
  }

  const level = reading.CrowdLevel;
  const filled = level === "h" ? 3 : level === "m" ? 2 : level === "l" ? 1 : 0;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="block h-5 w-5 border-2"
              style={{
                borderColor: "var(--border)",
                background: i < filled ? COLOR[level] : "transparent",
              }}
            />
          ))}
        </div>
        <span className="font-pixel text-[10px] uppercase" style={{ color: COLOR[level] }}>
          {t(LABEL_KEY[level])}
        </span>
      </div>
      <p className="mt-2 text-xs text-fg-faint">
        {t("crowd.reading", {
          start: new Date(reading.StartTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          end: new Date(reading.EndTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })}
      </p>
    </div>
  );
}
