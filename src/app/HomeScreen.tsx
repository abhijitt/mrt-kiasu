"use client";

import Link from "next/link";
import { AlertBanner } from "@/components/AlertBanner";
import { Hud } from "@/components/Hud";
import { LegalFooter } from "@/components/LegalPage";
import { Avatar, avatarLabelKey } from "@/components/Avatar";
import { JourneyForm } from "./JourneyForm";
import { useT } from "@/i18n/I18nProvider";
import { useLineName } from "@/i18n/useLineName";
import { useSettings } from "@/lib/settings";
import type { MessageKey } from "@/i18n/I18nProvider";
import type { StationOption } from "@/components/StationPicker";
import { type LineCode } from "@/lib/lines";

interface LineSummary {
  code: LineCode;
  shortName: string;
  colorVar: string;
  inkVar: string;
  stationCount: number;
}

interface Props {
  stations: StationOption[];
  lines: LineSummary[];
  exitCount: number;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-pixel text-base leading-none text-accent">{value}</span>
      <span className="mt-1.5 text-[11px] uppercase tracking-wide text-fg-faint">
        {label}
      </span>
    </div>
  );
}

export function HomeScreen({ stations, lines, exitCount }: Props) {
  const t = useT();
  const lineName = useLineName();
  const { settings } = useSettings();

  return (
    <div className="min-h-dvh">
      <Hud>
        <p className="mt-2 text-xs opacity-70">{t("app.tagline")}</p>
      </Hud>
      {/* The whole network's colours as one bar: the app's spectrum in miniature. */}
      <div className="flex h-2 w-full">
        {lines.map((l) => (
          <span key={l.code} className="flex-1" style={{ background: `var(${l.colorVar})` }} />
        ))}
      </div>

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-16 pt-5">
        {/* Hero: the whole point of the app, given the heaviest frame on screen. */}
        <section className="pixel-box-hero anim-enter anim-enter-1">
          <div className="flex items-center gap-3 border-b-3 border-[var(--border)] bg-bg-sunken px-4 py-3">
            <Avatar
              id={settings.avatar}
              size={40}
              className="anim-bob"
              skinTone={settings.skinTone}
              label={t(avatarLabelKey(settings.avatar) as MessageKey)}
            />
            <p className="font-pixel text-xs leading-relaxed text-fg">
              {t("home.whereGoing")}
            </p>
          </div>
          <div className="p-4">
            <JourneyForm stations={stations} />
          </div>
        </section>

        <AlertBanner />

        <section className="pixel-box anim-enter anim-enter-3 flex items-center justify-between px-4 py-3">
          <Stat value={stations.length} label={t("home.stats.stations")} />
          <span className="dither h-8 w-px" aria-hidden />
          <Stat value={exitCount} label={t("home.stats.exits")} />
          <span className="dither h-8 w-px" aria-hidden />
          <Stat value={lines.length} label={t("home.stats.lines")} />
        </section>

        <section className="anim-enter anim-enter-4">
          <h2 className="font-pixel mb-3 text-[11px] uppercase text-fg-muted">
            {t("home.browseByLine")}
          </h2>
          {/* The network's colour coding is the strongest visual language the
              MRT already has, so each line gets a solid block of its own. */}
          <ul className="flex flex-col gap-2">
            {lines.map((line) => (
              <li key={line.code}>
                <Link
                  href={`/line/${line.code}`}
                  className="pixel-btn flex items-stretch gap-0 overflow-hidden p-0"
                >
                  <span
                    className="font-pixel flex w-16 shrink-0 items-center justify-center border-r-3 border-[var(--border)] text-xs"
                    style={{
                      background: `var(${line.colorVar})`,
                      color: `var(${line.inkVar})`,
                    }}
                  >
                    {line.shortName}
                  </span>
                  <span className="flex flex-1 items-center justify-between gap-2 px-3 py-3.5">
                    <span className="text-base leading-tight text-fg">
                      {lineName(line.code)}
                    </span>
                    <span className="font-pixel shrink-0 text-[10px] text-fg-faint">
                      {line.stationCount}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-col gap-3 text-xs leading-relaxed text-fg-faint">
          <p>{t("home.footer", { count: stations.length })}</p>
          <LegalFooter />
        </footer>
      </main>
    </div>
  );
}
