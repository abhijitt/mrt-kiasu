"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Avatar,
  AVATAR_IDS,
  SECRET_AVATARS,
  SKIN_TONES,
  avatarLabelKey,
} from "@/components/Avatar";
import { useKonami } from "@/lib/useKonami";
import { Hud } from "@/components/Hud";
import { LegalFooter } from "@/components/LegalPage";
import { KIASU_LEVELS, useSettings, type ThemeChoice } from "@/lib/settings";
import { useKiasuScore } from "@/lib/useKiasuScore";
import { minutes } from "@/lib/kiasu-score";
import type { FeatureType } from "@/lib/feature-types";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { FARE_TYPES } from "@/lib/fare-types";
import { LOCALE_NAMES } from "@/i18n/config";

const EXIT_MODES: FeatureType[] = ["escalator", "lift", "stairs"];
// The five the PTC publishes a table for, and the five LTA's own calculator
// offers. There is no child fare: under 0.9 m rides free, and school children
// hold a student card.
const FARE_OPTIONS = FARE_TYPES;
const THEMES: ThemeChoice[] = ["system", "light", "dark"];
const THEME_KEY: Record<ThemeChoice, MessageKey> = {
  system: "theme.auto",
  light: "theme.light",
  dark: "theme.dark",
};

interface Props {
  /** Computed on the server so the client never imports the datasets. */
  stats: {
    verifiedPlatforms: number;
    verifiedFeatures: number;
    estimatedPlatforms: number;
    estimatedFeatures: number;
  };
}

export function SettingsScreen({ stats }: Props) {
  const { settings, update, loaded } = useSettings();
  const { score, reset: resetScore } = useKiasuScore();
  const [justUnlocked, setJustUnlocked] = useState(false);

  useKonami(() => {
    const missing = SECRET_AVATARS.filter((a) => !settings.unlocked.includes(a));
    if (missing.length === 0) return;
    update({ unlocked: [...settings.unlocked, ...missing] });
    setJustUnlocked(true);
  });

  // Secret avatars stay out of the grid until they are found.
  const visibleAvatars = AVATAR_IDS.filter(
    (id) => !SECRET_AVATARS.includes(id) || settings.unlocked.includes(id),
  );
  const { t, locale } = useI18n();

  return (
    <div className="min-h-dvh">
      <Hud title={t("settings.title")} backHref="/" />

      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-16 pt-5">

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("settings.language")}
        </h2>
        <p className="mt-3 text-base text-fg">{LOCALE_NAMES[locale].native}</p>
        <p className="mt-1 text-xs text-fg-faint">
          {t("common.language")} · {LOCALE_NAMES[locale].english}
        </p>
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("settings.avatar")}
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {visibleAvatars.map((id) => {
            const active = loaded && settings.avatar === id;
            const label = t(avatarLabelKey(id) as MessageKey);
            return (
              <button
                key={id}
                type="button"
                onClick={() => update({ avatar: id })}
                aria-pressed={active}
                title={label}
                className="pixel-btn flex flex-col items-center gap-2 px-1 py-3"
                style={
                  active ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                <Avatar id={id} size={44} label={label} skinTone={settings.skinTone} />
              </button>
            );
          })}
        </div>
        {loaded && (
          <p className="mt-3 text-sm text-fg-muted">
            {t(avatarLabelKey(settings.avatar) as MessageKey)}
          </p>
        )}

        {justUnlocked && (
          <p
            className="pixel-box-sm anim-pop mt-3 p-3 text-sm"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
            role="status"
          >
            ★ {t("egg.unlocked")}
          </p>
        )}

        <h3 className="font-pixel mt-5 text-xs uppercase text-fg-muted">
          {t("settings.skinTone")}
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {SKIN_TONES.map((tone) => {
            const active = loaded && settings.skinTone === tone.id;
            return (
              <button
                key={tone.id}
                type="button"
                onClick={() => update({ skinTone: tone.id })}
                aria-pressed={active}
                aria-label={t(`tone.${tone.id}` as MessageKey)}
                title={t(`tone.${tone.id}` as MessageKey)}
                className="pixel-btn h-11 w-11"
                style={{
                  background: tone.base,
                  outline: active ? "3px solid var(--accent)" : undefined,
                  outlineOffset: active ? "2px" : undefined,
                }}
              />
            );
          })}
        </div>
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("score.title")}
        </h2>
        {score.journeys === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">{t("score.empty")}</p>
        ) : (
          <>
            <p className="mt-2 text-base leading-relaxed text-fg">
              {minutes(score) >= 1
                ? t("score.body", { minutes: minutes(score), journeys: score.journeys })
                : t("score.bodySeconds", {
                    seconds: score.seconds,
                    journeys: score.journeys,
                  })}
            </p>
            <p className="mt-1 text-xs text-fg-faint">
              {t("score.since", { date: score.since })}
            </p>
            <button
              type="button"
              onClick={resetScore}
              className="pixel-btn font-pixel mt-3 min-h-11 px-3 py-3 text-[11px] uppercase"
            >
              {t("score.reset")}
            </button>
          </>
        )}
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("kiasu.title")}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">{t("kiasu.lead")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {KIASU_LEVELS.map((level) => {
            const active = loaded && settings.kiasuLevel === level;
            return (
              <button
                key={level}
                type="button"
                onClick={() => update({ kiasuLevel: level })}
                aria-pressed={active}
                className="pixel-btn flex flex-col items-start gap-0.5 px-3 py-3 text-left"
                style={
                  active ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                <span className="font-pixel text-xs uppercase">
                  {t(`kiasu.${level}` as MessageKey)}
                </span>
                <span className="text-sm opacity-80">
                  {t(`kiasu.${level}Hint` as MessageKey)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("settings.headFor")}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">{t("settings.headForHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {EXIT_MODES.map((mode) => {
            const active = loaded && settings.preferredExitMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => update({ preferredExitMode: mode })}
                aria-pressed={active}
                className="pixel-btn flex flex-col items-start gap-0.5 px-3 py-3 text-left"
                style={
                  active ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                <span className="font-pixel text-xs uppercase">
                  {t(`mode.${mode}` as MessageKey)}
                </span>
                <span className="text-sm opacity-80">
                  {t(`mode.${mode}.hint` as MessageKey)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("settings.fareType")}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">{t("settings.fareTypeHint")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {FARE_OPTIONS.map((type) => {
            const active = loaded && settings.fareType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => update({ fareType: type })}
                aria-pressed={active}
                className="pixel-btn flex flex-col items-start gap-0.5 px-3 py-3 text-left"
                style={
                  active ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                <span className="font-pixel text-xs uppercase">
                  {t(`fareType.${type}` as MessageKey)}
                </span>
                <span className="text-sm opacity-80">
                  {t(`fareType.${type}.hint` as MessageKey)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("settings.theme")}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {THEMES.map((choice) => {
            const active = loaded && settings.theme === choice;
            return (
              <button
                key={choice}
                type="button"
                onClick={() => update({ theme: choice })}
                aria-pressed={active}
                className="pixel-btn font-pixel px-2 py-3 text-[11px] uppercase"
                style={
                  active ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
                }
              >
                {t(THEME_KEY[choice])}
              </button>
            );
          })}
        </div>
      </section>

      <section className="pixel-box anim-enter p-4">
        <h2 className="font-pixel text-xs uppercase text-fg-muted">
          {t("settings.coverage")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-fg">
          {t("settings.coverageBody", {
            verified: stats.verifiedFeatures,
            estimated: stats.estimatedFeatures,
          })}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          {t("settings.coverageNote")}
        </p>
      </section>

      <Link
        href="/report"
        className="pixel-btn font-pixel px-4 py-4 text-center text-xs uppercase"
      >
        {t("report.link")}
      </Link>

      <footer className="flex flex-col gap-3 text-sm leading-relaxed text-fg-faint">
        <p>{t("settings.privacy")}</p>
        <LegalFooter />
      </footer>
      </main>
    </div>
  );
}
