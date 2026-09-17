import type { FeatureType } from "@/lib/feature-types";

/**
 * What stands on a platform, drawn rather than typed.
 *
 * These were block characters — ▟ ▤ ▚ — and two problems came with them.
 * Press Start 2P has no such glyphs, so the OS picked a fallback and decided
 * for us how a station's plan looked; and measured on the page, an escalator
 * and the stairs beside it sat 1.3 units apart with 8.7-unit glyphs, which at
 * the size this renders is under two pixels of daylight. Two dark diagonal
 * marks that close read as one mark, which is exactly the complaint.
 *
 * Drawn as rectangles on a 16x16 grid they are crisp at any size, identical
 * on every device, and — the point — shaped differently enough to tell apart
 * at a glance: stairs are a solid flight of steps, an escalator is the smooth
 * incline that has no steps to climb, a lift is a car with doors.
 */
type Rect = readonly [x: number, y: number, w: number, h: number];

const MARK: Record<FeatureType, readonly Rect[]> = {
  // A flight seen side-on: four steps rising to the right, solid beneath.
  stairs: [
    [0, 12, 4, 4],
    [4, 8, 4, 8],
    [8, 4, 4, 12],
    [12, 0, 4, 16],
  ],
  // The same rise with nothing to climb — blocks overlap by a unit so the
  // band reads as one continuous incline rather than four dashes.
  escalator: [
    [0, 10, 4, 4],
    [4, 7, 4, 4],
    [8, 4, 4, 4],
    [12, 1, 4, 4],
  ],
  // A car with its doors shut.
  lift: [
    [0, 0, 16, 2],
    [0, 14, 16, 2],
    [0, 2, 2, 12],
    [14, 2, 2, 12],
    [7, 2, 2, 12],
  ],
  // Up and out.
  exit: [
    [6, 0, 4, 2],
    [4, 2, 8, 2],
    [2, 4, 12, 2],
    [6, 6, 4, 10],
  ],
};

interface Props extends React.SVGProps<SVGSVGElement> {
  type: FeatureType;
  /** Rendered edge length. In the plan these are viewBox units, not pixels. */
  size?: number;
}

/**
 * Nested inside another <svg> it positions with x/y like any other element,
 * and standing alone it is an inline icon — one component for the plan, the
 * platform diagram, the feature list and the legend, so the four can never
 * drift into meaning different things by the same symbol.
 */
export function FeatureMark({ type, size = 16, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {MARK[type].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} />
      ))}
    </svg>
  );
}
