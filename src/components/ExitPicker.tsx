"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { groupByExit, searchLandmarks, type Landmark } from "@/lib/landmark-types";

interface Props {
  exits: string[];
  /** Every landmark at this station, each carrying its nearest exit. */
  landmarks: Landmark[];
  selected: string | null;
  onSelect: (exitCode: string | null) => void;
}

/** How many to show per exit before searching. */
const PREVIEW_PER_EXIT = 3;

/**
 * Pick the way out by the thing you are actually going to, not by exit letter.
 *
 * Nobody knows they want "Exit C" — they know they want Junction 8. Searching
 * landmarks and selecting the exit that serves them inverts that, and choosing
 * one re-targets the door guidance above.
 */
export function ExitPicker({ exits, landmarks, selected, onSelect }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const byExit = useMemo(() => groupByExit(landmarks), [landmarks]);

  // Search the whole station, then attribute hits to the exit that serves them,
  // so a query finds a place regardless of which exit it happens to sit near.
  const matchesByExit = useMemo(() => {
    if (!q) return null;
    const grouped: Record<string, Landmark[]> = {};
    for (const l of searchLandmarks(landmarks, q)) {
      (grouped[l.exit] ??= []).push(l);
    }
    return grouped;
  }, [landmarks, q]);

  const results = useMemo(() => {
    return exits
      .map((code) => {
        const nearby = byExit[code] ?? [];
        if (!matchesByExit) return { code, nearby, matched: [] as Landmark[] };
        const matched = matchesByExit[code] ?? [];
        const codeMatches = code.toLowerCase() === q;
        return codeMatches || matched.length > 0 ? { code, nearby, matched } : null;
      })
      .filter((x): x is { code: string; nearby: Landmark[]; matched: Landmark[] } => x !== null)
      // Rank exits by their best hit, keeping searchLandmarks' ordering.
      .sort((a, b) => {
        if (!matchesByExit) return 0;
        return (a.matched[0]?.metres ?? Infinity) - (b.matched[0]?.metres ?? Infinity);
      });
  }, [exits, byExit, matchesByExit, q]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("exit.searchPlaceholder")}
        aria-label={t("exit.searchPlaceholder")}
        className="pixel-box-sm w-full bg-bg-raised px-3 py-3 text-base text-fg"
      />

      {selected && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="pixel-btn font-pixel self-start px-3 py-2 text-xs"
        >
          ✕ {t("exit.clearSelection")}
        </button>
      )}

      {results.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("exit.noMatches", { query })}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map(({ code, nearby, matched }) => {
            const isSelected = selected === code;
            // When searching, lead with what matched; otherwise the closest few.
            const show =
              matched.length > 0 ? matched.slice(0, 5) : nearby.slice(0, PREVIEW_PER_EXIT);
            return (
              <li key={code}>
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : code)}
                  aria-pressed={isSelected}
                  className="pixel-btn flex w-full items-start gap-3 p-3 text-left"
                  style={
                    isSelected
                      ? { background: "var(--accent)", color: "var(--accent-fg)" }
                      : undefined
                  }
                >
                  <span className="font-pixel shrink-0 border-2 border-[var(--border)] bg-[var(--bg-sunken)] px-2 py-1 text-xs text-fg">
                    {code}
                  </span>
                  <span className="min-w-0 flex-1">
                    {show.length > 0 ? (
                      <ul className="flex flex-col gap-0.5">
                        {show.map((l) => (
                          <li key={`${l.name}-${l.kind}`} className="text-sm leading-snug">
                            {l.name}
                            <span className="text-xs opacity-70">
                              {" "}
                              · {t(`landmark.${l.kind}` as MessageKey)}
                              {l.street ? ` · ${l.street}` : ""} · {l.metres} m
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-sm opacity-70">{t("exit.noLandmarks")}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-fg-faint">{t("station.landmarkNote")}</p>
    </div>
  );
}
