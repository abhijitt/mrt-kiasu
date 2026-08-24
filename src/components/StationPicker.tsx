"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { LINES, type LineCode } from "@/lib/lines";
import { useT } from "@/i18n/I18nProvider";
import { EGG_TRIGGERS, EasterEgg, type EggId } from "./EasterEgg";

export interface StationOption {
  name: string;
  codes: string[];
  lines: LineCode[];
}

interface Props {
  label: string;
  value: string;
  onChange: (name: string) => void;
  stations: StationOption[];
  /** Station name to exclude, so origin and destination can't match. */
  exclude?: string;
}

/**
 * Type-to-filter station picker.
 *
 * A plain <select> with 180 stations is unusable on a phone, so this filters as
 * you type while still working without JavaScript-heavy combobox machinery.
 */
export function StationPicker({ label, value, onChange, stations, exclude }: Props) {
  const t = useT();
  const id = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [egg, setEgg] = useState<EggId | null>(null);

  // Typing something only a local would try gets a small reward. It never
  // interferes with the search itself.
  useEffect(() => {
    const hit = EGG_TRIGGERS[query.trim().toLowerCase()];
    if (hit) setEgg(hit);
  }, [query]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = stations.filter((s) => s.name !== exclude);
    if (!q) return pool.slice(0, 8);
    return pool
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.codes.some((c) => c.toLowerCase().startsWith(q)),
      )
      .slice(0, 8);
  }, [query, stations, exclude]);

  const showList = focused && matches.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-pixel text-xs uppercase text-fg-muted">
        {label}
      </label>

      {value ? (
        <div className="pixel-box-sm flex items-center gap-3 px-3 py-3">
          <span className="flex-1 text-base text-fg">{value}</span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="font-pixel px-2 py-1 text-xs text-fg-muted"
            aria-label={`${t("common.clear")} ${label}`}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            type="text"
            value={query}
            placeholder={t("form.typeStation")}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            // Delay so a tap on a suggestion registers before the list closes.
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            className="pixel-box-sm w-full bg-bg-raised px-3 py-3 text-base text-fg"
          />
          {egg && <EasterEgg id={egg} onDismiss={() => setEgg(null)} />}
          {showList && !egg && (
            <ul className="pixel-box absolute z-20 mt-1 max-h-72 w-full overflow-y-auto">
              {matches.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(s.name);
                      setQuery("");
                      setFocused(false);
                    }}
                    className="flex w-full items-center gap-2 border-b-2 border-border-soft px-3 py-3 text-left last:border-b-0 active:bg-bg-sunken"
                  >
                    <span className="flex shrink-0 gap-1">
                      {s.codes.map((c, i) => (
                        <span
                          key={c}
                          className="font-pixel flex h-6 items-center px-1.5 text-[10px] text-white"
                          style={{
                            background: `var(${LINES[s.lines[i]].colorVar})`,
                            color: `var(${LINES[s.lines[i]].inkVar})`,
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                    <span className="text-base text-fg">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
