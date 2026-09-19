"use client";

import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import type { Landmark } from "@/lib/landmark-types";

/** Shown before the reader asks for the rest, where there is room. */
const PREVIEW = 4;

/**
 * Shown when the station has enough exits that four each is a wall.
 *
 * Deliberately not a collapse. The question these answer is "which exit for
 * Plaza Singapura", which is asked by scanning every exit at once — hiding
 * each exit behind a tap would break the one thing the list is for. Two lines
 * still says what kind of place each exit comes out at, and "show all" is
 * there for the exit that looks right.
 */
const PREVIEW_DENSE = 2;

/** Above this many exits, each one shows fewer. */
const DENSE_EXITS = 3;

export function previewFor(exitCount: number): number {
  return exitCount > DENSE_EXITS ? PREVIEW_DENSE : PREVIEW;
}

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
export function ExitLandmarks({
  code,
  items,
  preview = PREVIEW,
}: {
  code: string;
  items: Landmark[];
  preview?: number;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, preview);
  const hidden = items.length - shown.length;

  return (
    <li className="flex gap-3">
      {/* The letter alone, in a narrow gutter. Measured at Dhoby Ghaut, each
          exit in its own bordered card spent 87px on padding, heading and
          button to show 38px of landmarks, and an exit with nothing recorded
          spent 75px saying so. The box was most of the section. */}
      <span className="font-pixel w-5 shrink-0 pt-0.5 text-xs text-accent">
        {code}
        <span className="sr-only"> {t("station.landmarkKind.exit", { code })}</span>
      </span>
      <div className="min-w-0 flex-1">
        {items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("station.landmarkNone")}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {shown.map((l) => (
                // One line each, clipped rather than wrapped: a long name
                // wrapping to three lines made two exits look like four.
                <li key={`${l.name}-${l.kind}`} className="truncate text-sm text-fg">
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
                className="font-pixel mt-1 text-[10px] uppercase text-fg-muted underline"
              >
                {expanded
                  ? t("station.showFewer")
                  : t("station.showAll", { count: items.length })}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
