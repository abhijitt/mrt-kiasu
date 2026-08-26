"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import {
  serviceDayOf,
  statusFor,
  worstStatus,
  type Status,
  type TrainTime,
} from "@/lib/service-status";
import {
  applyAdjustment,
  type AdjustedTime,
  type ServiceAdjustment,
} from "@/lib/service-adjustments";

/**
 * Warns when trains are not running, or nearly aren't.
 *
 * Computed in the browser rather than on the server, because the page may be
 * cached and a warning about the last train has to reflect the reader's clock,
 * not the moment the HTML was built.
 */
export function ServiceWarning({
  times,
}: {
  times: Partial<Record<"weekday" | "saturday" | "sunday", TrainTime[]>> | null;
}) {
  const t = useT();
  const [status, setStatus] = useState<{
    status: Status;
    towards: string;
    /** Set when a published adjustment supplied the time being warned about. */
    adjustedBy: ServiceAdjustment | null;
  } | null>(null);

  useEffect(() => {
    if (!times) return;

    function evaluate() {
      const now = new Date();
      const rows = times![serviceDayOf(now)] ?? [];
      if (rows.length === 0) return;

      const minutes = now.getHours() * 60 + now.getMinutes();
      // A published adjustment beats the timetable. Applied here, against the
      // reader's own clock, because this page can be cached and an adjustment
      // that starts on Friday must not be baked in on Wednesday.
      const each = rows.map((row) => {
        const applied: AdjustedTime = row.line
          ? applyAdjustment(row, row.line, now)
          : row;
        return { row: applied, status: statusFor(applied, minutes) };
      });
      const worst = worstStatus(each.map((e) => e.status));
      const match = each.find((e) => e.status.kind === worst.kind) ?? each[0];
      setStatus({
        status: worst,
        towards: match.row.towards,
        adjustedBy: match.row.adjustedBy ?? null,
      });
    }

    evaluate();
    // Re-checked because someone can sit on this page as the last train goes.
    const timer = setInterval(evaluate, 60_000);
    return () => clearInterval(timer);
  }, [times]);

  if (!status || status.status.kind === "running") return null;

  const s = status.status;
  const urgent = s.kind === "afterLast";

  const message =
    s.kind === "afterLast"
      ? t("status.afterLast", { towards: status.towards, last: s.last })
      : s.kind === "beforeFirst"
        ? t("status.beforeFirst", {
            towards: status.towards,
            first: s.first,
            minutes: s.minutesUntil,
          })
        : t("status.lastSoon", {
            towards: status.towards,
            last: s.last,
            minutes: s.minutesLeft,
          });

  return (
    <div
      className="pixel-box anim-enter p-4"
      style={{ borderColor: urgent ? "var(--danger)" : "var(--candidate)" }}
      role="status"
    >
      <p
        className="text-base leading-relaxed"
        style={{ color: urgent ? "var(--danger)" : "var(--fg)" }}
      >
        {message}
      </p>
      {/* Where the figure came from, when it did not come from the timetable.
          The alert text is quoted rather than summarised: it is the citation,
          and paraphrasing it would put words in LTA's mouth. */}
      {status.adjustedBy && (
        <details className="mt-2">
          <summary
            className="cursor-pointer text-xs leading-relaxed"
            style={{ color: "var(--candidate)" }}
          >
            {t("status.adjusted")}
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-fg-faint">
            {status.adjustedBy.sourceNote}
          </p>
        </details>
      )}
      <p className="mt-2 text-xs leading-relaxed text-fg-faint">{t("status.approx")}</p>
    </div>
  );
}
