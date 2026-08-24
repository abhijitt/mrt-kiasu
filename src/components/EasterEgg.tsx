"use client";

import { useT } from "@/i18n/I18nProvider";

export type EggId = "durian" | "chope";

/** Search terms that open an egg, matched case-insensitively. */
export const EGG_TRIGGERS: Record<string, EggId> = {
  durian: "durian",
  durians: "durian",
  chope: "chope",
  choped: "chope",
};

function DurianSign() {
  // A durian, crossed out. Drawn rather than imported so it themes with
  // everything else and costs no request.
  return (
    <svg viewBox="0 0 48 48" width="112" height="112" shapeRendering="crispEdges" aria-hidden>
      <circle cx="24" cy="26" r="14" fill="#8a9a3b" stroke="var(--border)" strokeWidth="2" />
      {[
        [24, 12], [16, 16], [32, 16], [12, 24], [36, 24],
        [16, 34], [32, 34], [24, 39], [24, 26], [18, 26], [30, 26],
      ].map(([x, y]) => (
        <polygon
          key={`${x}-${y}`}
          points={`${x},${y - 4} ${x - 3},${y + 2} ${x + 3},${y + 2}`}
          fill="#6f7d2c"
          stroke="var(--border)"
          strokeWidth="1"
        />
      ))}
      <rect x="22" y="6" width="4" height="7" fill="#6b4423" stroke="var(--border)" strokeWidth="1" />
      <circle cx="24" cy="26" r="21" fill="none" stroke="var(--danger)" strokeWidth="4" />
      <line x1="9" y1="41" x2="39" y2="11" stroke="var(--danger)" strokeWidth="4" />
    </svg>
  );
}

function TissuePacket() {
  // The packet of tissue that reserves a seat. Nothing else needed.
  return (
    <svg viewBox="0 0 48 48" width="112" height="112" shapeRendering="crispEdges" aria-hidden>
      <rect x="6" y="30" width="36" height="12" fill="var(--bg-sunken)" stroke="var(--border)" strokeWidth="2" />
      <rect x="6" y="26" width="36" height="4" fill="var(--border-soft)" />
      <rect x="14" y="12" width="20" height="15" rx="1" fill="#f7f5ee" stroke="var(--border)" strokeWidth="2" />
      <rect x="18" y="16" width="12" height="2" fill="#d0cec4" />
      <rect x="18" y="20" width="9" height="2" fill="#d0cec4" />
      <rect x="20" y="8" width="8" height="5" fill="#ffffff" stroke="var(--border)" strokeWidth="2" />
    </svg>
  );
}

/**
 * The little rewards for typing something only a local would try.
 *
 * Deliberately inert: an egg never changes guidance, invents data, or gets in
 * the way of the search that triggered it.
 */
export function EasterEgg({ id, onDismiss }: { id: EggId; onDismiss: () => void }) {
  const t = useT();
  const isDurian = id === "durian";

  return (
    <div
      className="pixel-box anim-pop mt-2 flex flex-col items-center gap-3 p-4 text-center"
      role="status"
    >
      {isDurian ? <DurianSign /> : <TissuePacket />}

      <p className="font-pixel text-xs uppercase" style={{ color: "var(--accent)" }}>
        {t(isDurian ? "egg.durian.title" : "egg.chope.title")}
      </p>

      {isDurian && (
        <p
          className="font-pixel border-2 border-[var(--border)] px-3 py-1.5 text-[11px]"
          style={{ color: "var(--danger)" }}
        >
          {t("egg.durian.fine")}
        </p>
      )}

      <p className="text-sm leading-relaxed text-fg-muted">
        {t(isDurian ? "egg.durian.body" : "egg.chope.body")}
      </p>

      <button
        type="button"
        onClick={onDismiss}
        className="pixel-btn font-pixel px-4 py-2.5 text-[11px] uppercase"
      >
        {t("egg.dismiss")}
      </button>
    </div>
  );
}
