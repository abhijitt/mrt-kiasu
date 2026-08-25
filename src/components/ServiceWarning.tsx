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
  const [status, setStatus] = useState<{ status: Status; towards: string } | null>(null);

  useEffect(() => {
    if (!times) return;

    function evaluate() {
      const now = new Date();
      const rows = times![serviceDayOf(now)] ?? [];
      if (rows.length === 0) return;

      const minutes = now.getHours() * 60 + now.getMinutes();
      const each = rows.map((row) => ({ row, status: statusFor(row, minutes) }));
      const worst = worstStatus(each.map((e) => e.status));
      const match = each.find((e) => e.status.kind === worst.kind) ?? each[0];
      setStatus({ status: worst, towards: match.row.towards });
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
      <p className="mt-2 text-xs leading-relaxed text-fg-faint">{t("status.approx")}</p>
    </div>
  );
}
