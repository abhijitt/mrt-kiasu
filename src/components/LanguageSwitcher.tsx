"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT } from "@/i18n/config";

/**
 * Language button. Sits beside Settings rather than inside it, because
 * someone who has landed on a page in a language they cannot read needs the
 * switch to be visible, not two taps deep.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("common.language")}
        className="hud-btn font-pixel flex h-12 w-12 items-center justify-center text-sm"
      >
        {LOCALE_SHORT[locale]}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("common.language")}
          className="pixel-box absolute right-0 z-30 mt-2 w-44 overflow-hidden"
        >
          {LOCALES.map((code) => {
            const active = code === locale;
            return (
              <li key={code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 border-b-2 border-border-soft px-3 py-3 text-left last:border-b-0 active:bg-bg-sunken"
                  style={
                    active
                      ? { background: "var(--accent)", color: "var(--accent-fg)" }
                      : undefined
                  }
                >
                  <span className="font-pixel w-7 text-sm">{LOCALE_SHORT[code]}</span>
                  <span className="text-base">{LOCALE_NAMES[code].native}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
