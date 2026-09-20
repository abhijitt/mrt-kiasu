"use client";

import { useState, useSyncExternalStore } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { adjustmentsFor, isoDateOf } from "@/lib/service-adjustments";
import { holidayOn, holidaysCover, serviceDayOf, type TrainTime } from "@/lib/service-status";

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
 *
 * Only today's is open. At Dhoby Ghaut the three sets are eighteen rows, and
 * two of them describe a day that is not today: 778px of the page, more than
 * a fifth of it, to answer a question nobody asked. The other days are one tap
 * away, which is the right price for the rarer question.
 */
export function TrainTimes({ times }: { times: Partial<Record<ServiceDay, TrainTime[]>> | null }) {
  const t = useT();
  const today = useSyncExternalStore(subscribeToDate, todaySnapshot, todayOnServer);
  const [allDays, setAllDays] = useState(false);

  // Falling back to the current date rather than to a guess: sgDayOfWeek reads
  // the Singapore calendar wherever it runs, so the server and the first
  // client render agree and nothing jumps at hydration.
  const when = today ? new Date(`${today}T12:00:00`) : new Date();
  const serviceDay = serviceDayOf(when);
  const holiday = holidayOn(when);

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

  const available = DAYS.filter((d) => times[d]?.length);
  // A station with only one set of times has nothing to collapse, and a
  // toggle offering to hide nothing is worse than no toggle.
  //
  // Past the last year MOM has gazetted, we cannot tell a holiday from an
  // ordinary Monday — so rather than show one timetable that might be the
  // wrong one, show all three and let the reader pick, which is what this did
  // before the list existed.
  const canCollapse = holidaysCover(when) && available.includes(serviceDay);
  const shown = allDays || !canCollapse ? available : [serviceDay];

  return (
    <div className="mt-3 flex flex-col gap-4">
      {/* Said out loud, because "Sun & PH" on a Tuesday looks like a bug. */}
      {holiday && !allDays && canCollapse && (
        <p className="text-sm leading-relaxed text-fg-muted">
          {t("times.holidayToday", { holiday })}
        </p>
      )}
      {shown.map((day) => (
        <div key={day}>
          <p id={`times-${day}`} className="font-pixel text-[10px] uppercase text-fg-muted">
            {t(`times.${day}` as MessageKey)}
          </p>
          {/* A table, not a stack of cards.
              Every row here answers the same two questions, so the labels
              belong at the top of two columns rather than repeated beside
              each of up to twelve times. At an interchange this section was
              taller than everything else on the page put together.

              Named by the heading above it rather than by a caption of its
              own. A caption repeating that heading, and a hidden corner cell
              repeating the section title, made the card read "First and last
              train / Saturday / Saturday / First and last train" to anyone
              taking it as text. Both were text already on the screen. */}
          <table
            aria-labelledby={`times-${day}`}
            className="mt-2 w-full border-collapse text-sm"
          >
            <thead>
              <tr className="font-pixel text-[9px] uppercase text-fg-faint">
                {/* The corner names nothing, so it claims nothing. */}
                <td />
                <th scope="col" className="pb-1 pl-3 text-right font-normal">
                  {t("times.first")}
                </th>
                <th scope="col" className="pb-1 pl-3 text-right font-normal">
                  {t("times.last")}
                </th>
              </tr>
            </thead>
            <tbody>
              {times[day]!.map((row) => (
                <tr key={row.towards} className="border-t border-[var(--border-soft)]">
                  {/* The destination is what names the row, so it is the row's
                      header: a screen reader then reads "Towards HarbourFront,
                      First, 06:12" instead of three bare numbers. */}
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal text-fg-muted">
                    {t("times.towards", { station: row.towards })}
                  </th>
                  {/* Tabular figures, so four departures read as a column of
                      times rather than four ragged strings. */}
                  <td className="py-1.5 pl-3 text-right tabular-nums text-fg">{row.first}</td>
                  <td className="py-1.5 pl-3 text-right tabular-nums text-fg">{row.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
      {available.length > shown.length || allDays ? (
        <button
          type="button"
          onClick={() => setAllDays((v) => !v)}
          className="font-pixel self-start text-[10px] uppercase text-fg-muted underline"
        >
          {allDays ? t("times.justToday") : t("times.otherDays")}
        </button>
      ) : null}
      <p className="text-xs leading-relaxed text-fg-faint">{t("times.source")}</p>
    </div>
  );
}
