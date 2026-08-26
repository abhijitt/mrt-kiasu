"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { adjustmentsFor, isoDateOf } from "@/lib/service-adjustments";
import type { TrainTime } from "@/lib/service-status";

/**
 * Today's date, read the way the app reads any other browser state.
 *
 * Whether an adjustment is in force depends on the reader's calendar date,
 * which the server cannot know for a cached page. A string snapshot, so
 * useSyncExternalStore can compare by value — returning a fresh Date every
 * call would never look equal and would loop.
 */
function subscribeToDate(listener: () => void): () => void {
  // A page left open overnight should not still be showing yesterday.
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
const todaySnapshot = () => isoDateOf(new Date());
const todayOnServer = () => "";

export type ServiceDay = "weekday" | "saturday" | "sunday";
export type { TrainTime };

const DAYS: ServiceDay[] = ["weekday", "saturday", "sunday"];

/**
 * First and last train, per direction and per kind of day.
 *
 * Grouped by day first because that is the question people actually arrive
 * with — "is it a Sunday timetable tonight" — and because the three sets
 * genuinely differ.
 */
export function TrainTimes({ times }: { times: Partial<Record<ServiceDay, TrainTime[]>> | null }) {
  const t = useT();
  const today = useSyncExternalStore(subscribeToDate, todaySnapshot, todayOnServer);

  // Derived during render from the snapshot above, so this stays pure: the
  // same date and the same rows always give the same answer.
  const adjustments = (() => {
    if (!times || !today) return [];
    const on = new Date(`${today}T12:00:00`);
    const lines = new Set(
      Object.values(times).flatMap((rows) =>
        rows.map((r) => r.line).filter((l): l is NonNullable<typeof l> => Boolean(l)),
      ),
    );
    const found = [...lines].flatMap((line) => adjustmentsFor(line, on));
    return [...new Map(found.map((a) => [a.id, a])).values()];
  })();

  if (!times) {
    return <p className="mt-3 text-sm leading-relaxed text-fg-muted">{t("times.none")}</p>;
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {DAYS.filter((d) => times[d]?.length).map((day) => (
        <div key={day}>
          <p className="font-pixel text-[10px] uppercase text-fg-muted">
            {t(`times.${day}` as MessageKey)}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {times[day]!.map((row) => (
              <div key={row.towards} className="pixel-box-sm p-3">
                <p className="text-sm text-fg-muted">
                  {t("times.towards", { station: row.towards })}
                </p>
                <div className="mt-1 flex items-baseline gap-4">
                  <span className="text-base text-fg">
                    <span className="font-pixel mr-2 text-[10px] uppercase text-fg-faint">
                      {t("times.first")}
                    </span>
                    {row.first}
                  </span>
                  <span className="text-base text-fg">
                    <span className="font-pixel mr-2 text-[10px] uppercase text-fg-faint">
                      {t("times.last")}
                    </span>
                    {row.last}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {/* Annotated, not rewritten.
          ServiceWarning knows today's actual date, so it can substitute the
          adjusted time. This table shows day TYPES, and the Downtown Line
          alert moves Friday's last train but not Monday's — writing 23:30 into
          the "weekday" row would be wrong four nights out of five. So the
          published times stand and the alert is quoted beside them. */}
      {adjustments.map((a) => (
        <div key={a.id} className="pixel-box-sm p-3" style={{ borderColor: "var(--candidate)" }}>
          <p className="font-pixel text-[10px] uppercase" style={{ color: "var(--candidate)" }}>
            {t("times.adjustedTitle")}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-fg-faint">{a.sourceNote}</p>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-fg-faint">{t("times.source")}</p>
    </div>
  );
}
