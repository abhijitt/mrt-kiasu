/**
 * Drawn symbols, for anything that is not a letter or a digit.
 *
 * The app's display font has no glyphs for symbols, so a character like "⚙"
 * silently falls back to a system font. Worse, some of these have BOTH a text
 * and an emoji presentation: U+2699 and U+2714 render as flat monochrome marks
 * on desktop and as colour emoji on iOS, so the same button looked like two
 * different buttons depending on the phone in your hand.
 *
 * Drawing them removes the font from the question entirely, and crisp edges
 * suit the rest of the art better than a typographic symbol would.
 */

interface IconProps {
  size?: number;
  className?: string;
}

/** Settings. A ring with four teeth and a square hole. */
export function GearIcon({ size = 22, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
      fill="currentColor"
    >
      {/* Teeth, at the middle of each edge. */}
      <rect x={6} y={0} width={2} height={2} />
      <rect x={6} y={12} width={2} height={2} />
      <rect x={0} y={6} width={2} height={2} />
      <rect x={12} y={6} width={2} height={2} />
      {/* Body, drawn as four bars so the centre stays open. */}
      <rect x={2} y={2} width={10} height={3} />
      <rect x={2} y={9} width={10} height={3} />
      <rect x={2} y={5} width={3} height={4} />
      <rect x={9} y={5} width={3} height={4} />
    </svg>
  );
}

/** A tick, for "no problems reported". */
export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
      shapeRendering="crispEdges"
      fill="currentColor"
    >
      <rect x={1} y={7} width={2} height={2} />
      <rect x={3} y={9} width={2} height={2} />
      <rect x={5} y={11} width={2} height={2} />
      <rect x={7} y={8} width={2} height={3} />
      <rect x={9} y={5} width={2} height={3} />
      <rect x={11} y={2} width={2} height={3} />
    </svg>
  );
}
