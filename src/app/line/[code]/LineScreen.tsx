"use client";

import Link from "next/link";
import { Hud } from "@/components/Hud";
import { useT } from "@/i18n/I18nProvider";
import { useLineName } from "@/i18n/useLineName";
import { type LineCode } from "@/lib/lines";

interface Props {
  code: LineCode;
  shortName: string;
  colorVar: string;
  inkVar: string;
  operator: string;
  train: { cars: number; doorsPerCar: number } | null;
  trainSource: string | null;
  stations: { code: string; name: string; isInterchange: boolean }[];
}

export function LineScreen(p: Props) {
  const t = useT();
  const lineName = useLineName();

  return (
    <div className="min-h-dvh">
      <Hud
        title={lineName(p.code)}
        backHref="/"
        accentVar={p.colorVar}
      />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-16 pt-5">
      <header className="anim-enter flex items-center gap-3">
        <span
          className="font-pixel flex h-12 w-16 shrink-0 items-center justify-center border-2 border-[var(--border)] text-xs"
          style={{ background: `var(${p.colorVar})`, color: `var(${p.inkVar})` }}
        >
          {p.shortName}
        </span>
        <div className="min-w-0">
          <h1 className="font-pixel text-base leading-relaxed text-fg">
            {lineName(p.code)}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {t("line.stationsAndOperator", {
              count: p.stations.length,
              operator: p.operator,
            })}
          </p>
        </div>
      </header>

      {p.train ? (
        <p className="pixel-box-sm p-3 text-sm leading-relaxed text-fg-muted">
          {t("line.trainLayout", { cars: p.train.cars, doors: p.train.doorsPerCar })}
          {p.trainSource && (
            <>
              <br />
              <span className="text-xs text-fg-faint">{p.trainSource}</span>
            </>
          )}
        </p>
      ) : (
        <p
          className="pixel-box-sm p-3 text-sm leading-relaxed"
          style={{ borderColor: "var(--candidate)" }}
        >
          {t("line.noFleetData")}
        </p>
      )}

      <ul className="pixel-box divide-y-2 divide-border-soft">
        {p.stations.map((s) => (
          <li key={s.code}>
            <Link
              href={`/station/${s.code}`}
              className="flex items-center gap-3 px-3 py-3.5 active:bg-bg-sunken"
            >
              <span
                className="font-pixel flex h-8 w-14 shrink-0 items-center justify-center border-2 border-[var(--border)] text-[10px]"
                style={{ background: `var(${p.colorVar})`, color: `var(${p.inkVar})` }}
              >
                {s.code}
              </span>
              <span className="text-base text-fg">{s.name}</span>
              {s.isInterchange && (
                <span className="font-pixel ml-auto text-xs text-fg-faint" aria-hidden>
                  ⇄
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      </main>
    </div>
  );
}
