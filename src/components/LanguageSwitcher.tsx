"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/I18nProvider";
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT } from "@/i18n/config";

/** Matches the width the list is drawn at, for positioning it in pixels. */
const MENU_W = 176;

/** Clearance from the viewport edge when the trigger is near one. */
const EDGE = 8;

/**
 * Language button. Sits beside Settings rather than inside it, because
 * someone who has landed on a page in a language they cannot read needs the
 * switch to be visible, not two taps deep.
 *
 * Settings shows the same control in a different coat: there the current
 * language is already written out beside it, so the trigger says "Change"
 * rather than repeating the language a third time. One component either way,
 * because the fiddly part is the dismiss behaviour — outside taps, Escape —
 * and having two copies of that is how one of them ends up not working.
 *
 * The list is rendered into <body> rather than beside the button. It floats
 * over the page in both places, which means it has to escape .pixel-box, and
 * .pixel-box notches its corners with a clip-path — which clips absolutely
 * positioned descendants as well as overflow. Inside the Settings card that
 * sliced the menu off at the card's edge. A portal has no such ancestor, so
 * the position is worked out from the button's rect rather than inherited.
 */
export function LanguageSwitcher({ variant = "hud" }: { variant?: "hud" | "inline" }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  /** Under the button and right-aligned to it, kept inside the viewport. */
  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Scrolled past its own button, the menu is left hanging over whatever
    // happens to be there now — anchored correctly and looking like a bug.
    if (r.bottom < 0 || r.top > window.innerHeight) {
      setOpen(false);
      return;
    }
    const left = Math.min(
      Math.max(r.right - MENU_W, EDGE),
      window.innerWidth - MENU_W - EDGE,
    );
    setAt({ top: r.bottom + EDGE, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();

    function outside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      // The list is no longer a descendant of the button's wrapper, so
      // "outside" has to mean outside both of them.
      if (trigger.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Capture, so scrolling any container moves the menu with its button
    // rather than leaving it behind in mid-air.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("common.language")}
        className={
          variant === "hud"
            ? "hud-btn font-pixel flex h-12 w-12 items-center justify-center text-sm"
            : "pixel-btn font-pixel px-3 py-2 text-[10px] uppercase"
        }
      >
        {variant === "hud" ? LOCALE_SHORT[locale] : t("common.change")}
      </button>

      {open &&
        at &&
        createPortal(
          <ul
            ref={list}
            role="listbox"
            aria-label={t("common.language")}
            style={{ position: "fixed", top: at.top, left: at.left, width: MENU_W }}
            className="pixel-box z-50 overflow-hidden"
          >
            {LOCALES.map((code) => {
              const active = code === locale;
              return (
                <li key={code}>
                  <button
                    type="button"
                    role="option"
                    lang={code}
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
          </ul>,
          document.body,
        )}
    </div>
  );
}
