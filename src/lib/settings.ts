"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SKIN_TONE, type AvatarId, type SkinToneId } from "@/components/Avatar";
import type { FeatureType } from "@/lib/positions";

export type ThemeChoice = "system" | "light" | "dark";

export interface Settings {
  avatar: AvatarId;
  /** Avatars found rather than given. */
  unlocked: AvatarId[];
  skinTone: SkinToneId;
  /** What the commuter usually wants to be nearest when they get off. */
  preferredExitMode: FeatureType;
  theme: ThemeChoice;
}

export const DEFAULT_SETTINGS: Settings = {
  avatar: "auntie",
  unlocked: [],
  skinTone: DEFAULT_SKIN_TONE,
  preferredExitMode: "escalator",
  theme: "system",
};

const KEY = "mrt-kiasu:settings";
const THEME_KEY = "mrt-kiasu:theme";

function read(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Private browsing, cleared storage, or blocked site data — defaults are fine.
    return DEFAULT_SETTINGS;
  }
}

function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Non-fatal: the theme still applies for this page view.
  }
}

/**
 * Settings live entirely in the browser — the app requires no login, so there
 * is nothing to sync and nothing to leak.
 */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(read());
    setLoaded(true);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Ignore: the change still applies for this session.
      }
      if (patch.theme) applyTheme(patch.theme);
      return next;
    });
  }, []);

  return { settings, update, loaded };
}
