"use client";

import { useId, useMemo, useState } from "react";
import { LINES, type LineCode } from "@/lib/lines";
import { useI18n } from "@/i18n/I18nProvider";
import { EGG_TRIGGERS, EasterEgg, type EggId } from "./EasterEgg";

export interface StationOption {
  name: string;
  /** Chinese name, where the dataset has one. Searchable, never the value. */
  nameZh?: string;
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
 *
 * Every station is listed, not a first few. The list used to cap at eight,
 * which quietly meant that opening it showed only the first eight
 * alphabetically — so anyone who did not already know a station's name had no
 * way to browse to it. The list scrolls, and a couple of hundred rows of two
 * spans each costs nothing to render.
 */
/**
 * The clear cross, drawn rather than typeset.
 *
 * It used to be a "✕" character in the pixel font, which sat visibly off
 * centre: Press Start 2P has no glyph at U+2715, so it silently fell back to
 * a system font, and its own tall-and-high metrics mean flex centres the line
 * box rather than the ink inside it. An SVG is centred by geometry, so it
 * cannot drift with the font, the locale or the platform — and crisp diagonal
 * steps suit the rest of the art better than a smooth typographic cross.
 */
function ClearIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width={16}
      height={16}
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
    >
      <path
        d="M2 2 L10 10 M10 2 L2 10"
        stroke="currentColor"
        strokeWidth={2}
        fill="none"
      />
    </svg>
  );
}

/** True when the query found this station by its Chinese name rather than its English one. */
function matchedZh(s: StationOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q || !s.nameZh) return false;
  return s.nameZh.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q);
}

export function StationPicker({ label, value, onChange, stations, exclude }: Props) {
  const { t, locale } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [egg, setEgg] = useState<EggId | null>(null);

  // Typing something only a local would try gets a small reward. It never
  // interferes with the search itself.
  //
  // Checked where the text changes rather than in an effect on `query`: an
  // effect would render the egg a frame late, and it must stay dismissable,
  // which derived state cannot do while the trigger is still in the box.
  function type(next: string) {
    setQuery(next);
    const hit = EGG_TRIGGERS[next.trim().toLowerCase()];
    if (hit) setEgg(hit);
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = stations.filter((s) => s.name !== exclude);
    if (!q) return pool;
    return pool.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        // Someone who knows a station as 海军部 and not as "Admiralty" could
        // not find it at all before this. Chinese has no case to fold, but
        // lowercasing is harmless and keeps the comparison uniform.
        (s.nameZh ?? "").toLowerCase().includes(q) ||
        s.codes.some((c) => c.toLowerCase().startsWith(q)),
    );
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
          {/* 44x44 minimum: this is a thumb target on a platform, not a
              mouse target. It was a bare glyph with 2px of padding, which is
              roughly a quarter of the area a finger needs. */}
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="pixel-btn flex h-11 w-11 shrink-0 items-center justify-center text-fg-muted"
            aria-label={`${t("common.clear")} ${label}`}
          >
            <ClearIcon />
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
            onChange={(e) => type(e.target.value)}
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
                    {/* English always leads: it is what is printed on the
                        station wall, and a reader of any language will have
                        seen it there. The local name sits under it for anyone
                        who knows the station only by that. */}
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-base text-fg">{s.name}</span>
                      {s.nameZh && (locale === "zh" || matchedZh(s, query)) && (
                        <span className="block text-sm text-fg-muted">{s.nameZh}</span>
                      )}
                    </span>
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
