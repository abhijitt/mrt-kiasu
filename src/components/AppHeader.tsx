"use client";

import Link from "next/link";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useT } from "@/i18n/I18nProvider";
import { GearIcon } from "./icons";

/** Language and settings, side by side, on every top-level screen. */
export function AppHeader() {
  const t = useT();
  return (
    <div className="flex shrink-0 items-start gap-2">
      <LanguageSwitcher />
      <Link
        href="/settings"
        aria-label={t("common.settings")}
        // The icon fills the button rather than floating in a large box.
        className="hud-btn flex h-12 w-12 items-center justify-center"
      >
        <GearIcon />
      </Link>
    </div>
  );
}
