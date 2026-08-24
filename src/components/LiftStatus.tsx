"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";

interface Outage {
  Line: string;
  StationCode: string;
  StationName: string;
  LiftID?: string;
  LiftDesc?: string;
}

/**
 * Lift outages at a station.
 *
 * LTA publishes ad-hoc lift maintenance and we were already fetching and
 * caching it — but nothing displayed it, which meant somebody who had set
 * their exit preference to Lift could be routed to one that is out of service.
 * That is the one case where being wrong strands a person.
 */
export function LiftStatus({
  stationCodes,
  stationName,
  /** Only surface the "this matters to you" line when it genuinely does. */
  emphasise,
}: {
  stationCodes: string[];
  stationName: string;
  emphasise?: boolean;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [outages, setOutages] = useState<Outage[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lta/lifts")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.configured) {
          setState("unavailable");
          return;
        }
        const wanted = new Set(stationCodes.map((c) => c.toUpperCase()));
        setOutages(
          (json.outages as Outage[]).filter((o) =>
            wanted.has((o.StationCode ?? "").toUpperCase()),
          ),
        );
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [stationCodes]);

  if (state === "loading") {
    return <p className="mt-3 text-sm text-fg-faint">{t("lift.checking")}</p>;
  }
  if (state === "unavailable") {
    return <p className="mt-3 text-sm text-fg-muted">{t("lift.unavailable")}</p>;
  }
  if (!outages || outages.length === 0) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
        <span aria-hidden style={{ color: "var(--verified)" }}>
          ✔
        </span>
        {t("lift.allWorking")}
      </p>
    );
  }

  const prefersLift = settings.preferredExitMode === "lift";

  return (
    <div
      className="pixel-box-sm anim-pop mt-3 p-3"
      style={{ borderColor: "var(--danger)" }}
      role="status"
    >
      <p className="font-pixel text-xs uppercase" style={{ color: "var(--danger)" }}>
        ⚠ {t("lift.outage")}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-fg">
        {t("lift.outageAt", { station: stationName })}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {outages.map((o, i) => (
          <li key={`${o.StationCode}-${o.LiftID ?? i}`} className="text-xs text-fg-muted">
            {o.LiftID ? `${o.LiftID} · ` : ""}
            {o.LiftDesc ?? o.StationName}
          </li>
        ))}
      </ul>
      {emphasise && prefersLift && (
        <p className="mt-2 text-sm font-semibold" style={{ color: "var(--danger)" }}>
          {t("lift.outageForYou")}
        </p>
      )}
    </div>
  );
}
