"use client";

import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";

export type ServiceDay = "weekday" | "saturday" | "sunday";

export interface TrainTime {
  towards: string;
  first: string;
  last: string;
}

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
      <p className="text-xs leading-relaxed text-fg-faint">{t("times.source")}</p>
    </div>
  );
}
