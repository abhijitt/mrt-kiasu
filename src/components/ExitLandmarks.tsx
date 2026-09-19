"use client";

import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import type { Landmark } from "@/lib/landmark-types";

/** Shown before the reader asks for the rest. */
const PREVIEW = 4;

/**
 * One exit, and the landmarks nearest it, truncated until asked.
 *
 * A dense station can list a dozen places per exit; printing them all turned
 * the page into a wall. Four is enough to recognise where an exit comes out.
 *
 * An exit with nothing recorded still appears. It is a real way out of the
 * station, and listing only the exits OpenStreetMap happens to know about
 * would quietly shorten the station.
 */
export function ExitLandmarks({ code, items }: { code: string; items: Landmark[] }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PREVIEW);
  const hidden = items.length - shown.length;

  if (items.length === 0) {
    return (
      <li className="pixel-box-sm p-3">
        <p className="font-pixel text-xs">{t("station.landmarkKind.exit", { code })}</p>
        <p className="mt-2 text-sm text-fg-muted">{t("station.landmarkNone")}</p>
      </li>
    );
  }

  return (
    <li className="pixel-box-sm p-3">
      <p className="font-pixel text-xs">{t("station.landmarkKind.exit", { code })}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {shown.map((l) => (
          <li key={`${l.name}-${l.kind}`} className="text-sm leading-snug text-fg">
            {l.name}
            <span className="text-xs text-fg-faint">
              {" "}
              · {t(`landmark.${l.kind}` as MessageKey)}
              {l.street ? ` · ${l.street}` : ""} · {l.metres} m
            </span>
          </li>
        ))}
      </ul>
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-pixel mt-2 text-[10px] uppercase text-fg-muted underline"
        >
          {expanded
            ? t("station.showFewer")
            : t("station.showAll", { count: items.length })}
        </button>
      )}
    </li>
  );
}
