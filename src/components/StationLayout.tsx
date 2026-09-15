"use client";

import { useI18n, type MessageKey } from "@/i18n/I18nProvider";
import type { FeatureType, PlatformFeature } from "@/lib/feature-types";
import type { LineCode } from "@/lib/lines";
import { FEATURE_GLYPH } from "./PlatformDiagram";

/**
 * Pixel-art plan of a station's platforms, with what stands on them.
 *
 * Drawn from the low-code end of the line to the high-code end, with the
 * neighbouring stations naming both ends. That is the one orientation that is
 * true whichever way the reader is travelling — the platform diagram already
 * answers the direction-relative question, and giving this one a direction too
 * would make the two pictures contradict each other for half of all readers.
 *
 * Only surveyed features are drawn. An estimate is a guess about where an exit
 * surfaces; putting guesses on a floor plan would make the plan look checked.
 */

export interface LayoutFeatureView {
  feature: PlatformFeature;
  /** More than one when a lift's door faces one side of an island platform. */
  doors: number[];
}

export interface LayoutPlatformView {
  directions: ("asc" | "desc")[];
  towards: string[];
  features: LayoutFeatureView[];
}

export interface LayoutBlockView {
  code: string;
  line: LineCode;
  colorVar: string;
  layout: "island" | "split-island" | "side" | "stacked" | null;
  totalDoors: number | null;
  platforms: LayoutPlatformView[];
  ends: { low: string | null; high: string | null };
}

/** Drawing geometry, in viewBox units. */
const G = {
  width: 320,
  padX: 30,
  trackH: 8,
  /** Caption line above the bar, then the bar itself. */
  captionH: 9,
  platformH: 22,
  gap: 5,
} as const;

type Row =
  | { kind: "track"; label?: string }
  | { kind: "platform"; platform: LayoutPlatformView };

/**
 * The rows of the plan, top to bottom.
 *
 * This is the whole difference between the layouts, and it is worth being
 * literal about: an island has one platform between two tracks, a split island
 * has a third track running between two platforms, side platforms sit outside
 * the tracks, and stacked platforms are on different levels and cannot honestly
 * be drawn as one section at all.
 */
function rowsFor(block: LayoutBlockView, centreTrackLabel: string): Row[] {
  const [first, second] = block.platforms;
  switch (block.layout) {
    case "island":
      return [{ kind: "track" }, { kind: "platform", platform: first }, { kind: "track" }];
    case "split-island":
      return [
        { kind: "track" },
        { kind: "platform", platform: first },
        { kind: "track", label: centreTrackLabel },
        ...(second ? [{ kind: "platform", platform: second } as Row] : []),
        { kind: "track" },
      ];
    case "side":
      return [
        { kind: "platform", platform: first },
        { kind: "track" },
        { kind: "track" },
        ...(second ? [{ kind: "platform", platform: second } as Row] : []),
      ];
    default:
      // Stacked, or a layout nobody has checked. Draw each platform with its
      // own track and claim no arrangement between them.
      return block.platforms.flatMap((platform) => [
        { kind: "platform", platform } as Row,
        { kind: "track" } as Row,
      ]);
  }
}

function heightOf(rows: Row[]): number {
  return rows.reduce(
    (h, r) =>
      h + (r.kind === "track" ? G.trackH + (r.label ? 10 : 0) : G.captionH + G.platformH) + G.gap,
    G.gap + 16,
  );
}

export function StationLayout({ block }: { block: LayoutBlockView }) {
  const { t } = useI18n();
  const rows = rowsFor(block, t("layout.centreTrack"));
  const height = heightOf(rows);
  const inner = G.width - G.padX * 2;
  const total = block.totalDoors;

  /** Fraction along the platform, measured from the low-code end. */
  const xFor = (doorIndex: number) =>
    G.padX + (total ? ((doorIndex - 0.5) / total) * inner : inner / 2);

  let y = G.gap + 16;
  const drawn: React.ReactNode[] = [];

  rows.forEach((row, i) => {
    if (row.kind === "track") {
      drawn.push(
        <g key={`t${i}`}>
          <rect
            x={G.padX}
            y={y}
            width={inner}
            height={G.trackH}
            fill="var(--bg-sunken)"
            stroke="var(--border-soft)"
            strokeWidth={1}
          />
          {/* Sleepers, so a track reads as a track and not as a thin platform. */}
          {Array.from({ length: 24 }, (_, k) => (
            <rect
              key={k}
              x={G.padX + 3 + k * (inner / 24)}
              y={y + 1}
              width={2}
              height={G.trackH - 2}
              fill="var(--border-soft)"
            />
          ))}
          {row.label && (
            <text
              x={G.width / 2}
              y={y + G.trackH + 9}
              textAnchor="middle"
              fontSize={7}
              fill="var(--fg-faint)"
              fontFamily="var(--font-pixel)"
            >
              {row.label}
            </text>
          )}
        </g>,
      );
      y += G.trackH + G.gap + (row.label ? 10 : 0);
      return;
    }

    const p = row.platform;
    // The caption sits ABOVE the bar rather than inside it. Inside, it shared
    // the bar with the feature glyphs and the two overlapped at every station
    // with more than a couple of things on the platform.
    drawn.push(
      <g key={`p${i}`}>
        <text
          x={G.padX}
          y={y + 7}
          fontSize={7}
          fill="var(--fg-faint)"
          fontFamily="var(--font-pixel)"
        >
          {p.towards.map((name) => `\u2192 ${name}`).join("   ")}
        </text>
        <rect
          x={G.padX}
          y={y + G.captionH}
          width={inner}
          height={G.platformH}
          fill="var(--bg-raised)"
          stroke={`var(${block.colorVar})`}
          strokeWidth={2}
        />
        {/* One glyph per physical thing. A staggered lift is drawn at the
            first of its doors rather than at both: two glyphs on one platform
            read as two lifts, which is the thing this is here to avoid. The
            second door is named in the list under the plan.

            Escalators and stairs share a landing constantly, so glyphs at one
            door are fanned out around it. Drawn at the same x they stacked
            into an unreadable blot that looked like a single odd symbol. */}
        {p.features.map((lf, k) => {
          const atThisDoor = p.features.filter((o) => o.doors[0] === lf.doors[0]);
          const rank = atThisDoor.indexOf(lf);
          const spread = (rank - (atThisDoor.length - 1) / 2) * 10;
          return (
            <text
              key={`${lf.feature.type}-${lf.doors[0]}-${k}`}
              x={xFor(lf.doors[0]) + spread}
              y={y + G.captionH + G.platformH / 2 + 6}
              textAnchor="middle"
              fontSize={14}
              fill="var(--fg)"
            >
              {FEATURE_GLYPH[lf.feature.type as FeatureType]}
            </text>
          );
        })}
        {p.features.length === 0 && (
          <text
            x={G.width / 2}
            y={y + G.captionH + G.platformH / 2 + 3}
            textAnchor="middle"
            fontSize={8}
            fill="var(--fg-faint)"
            fontFamily="var(--font-pixel)"
          >
            {t("layout.notSurveyed")}
          </text>
        )}
      </g>,
    );
    y += G.captionH + G.platformH + G.gap;
  });

  return (
    <svg
      viewBox={`0 0 ${G.width} ${height}`}
      width="100%"
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t("layout.alt", {
        station: block.code,
        layout: t(`layout.${block.layout ?? "unknown"}` as MessageKey),
      })}
    >
      {/* The ends carry the orientation, so the plan needs no direction. */}
      <text x={2} y={11} fontSize={7} fill="var(--fg-faint)" fontFamily="var(--font-pixel)">
        {block.ends.low ? `← ${block.ends.low}` : ""}
      </text>
      <text
        x={G.width - 2}
        y={11}
        textAnchor="end"
        fontSize={7}
        fill="var(--fg-faint)"
        fontFamily="var(--font-pixel)"
      >
        {block.ends.high ? `${block.ends.high} →` : ""}
      </text>
      {drawn}
    </svg>
  );
}
