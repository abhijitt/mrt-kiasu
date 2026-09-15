"use client";

/**
 * An 8-bit progress meter for how much of something has been surveyed.
 *
 * Deliberately blocky rather than a smooth bar: the underlying number is a
 * count of platforms a person has walked, and a segmented meter says "17 of
 * 402" in a way a continuous fill does not. A part-filled segment would imply
 * a precision the count does not have.
 */
const SEGMENTS = 20;

export function SurveyProgress({
  done,
  total,
  label,
  tone = "accent",
}: {
  done: number;
  total: number;
  label: string;
  /** "accent" for finished work, "candidate" for work merely begun. */
  tone?: "accent" | "candidate";
}) {
  const ratio = total > 0 ? done / total : 0;
  // Never round a started survey down to an empty meter: zero filled segments
  // has to mean zero, or the one station someone walked disappears.
  const filled = done === 0 ? 0 : Math.max(1, Math.round(ratio * SEGMENTS));
  const percent = total > 0 ? (ratio * 100).toFixed(ratio < 0.1 ? 1 : 0) : "0";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-pixel text-[10px] uppercase text-fg-muted">{label}</span>
        <span className="font-pixel text-[10px] text-fg tabular-nums">
          {done}/{total} · {percent}%
        </span>
      </div>
      <div
        className="mt-1 flex gap-[2px]"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="h-3 flex-1 border-2 border-[var(--border)]"
            style={{
              background:
                i < filled ? `var(--${tone})` : "var(--bg-sunken)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
