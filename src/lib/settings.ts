"use client";

import { useCallback, useSyncExternalStore } from "react";
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
 * One store shared by every caller of useSettings.
 *
 * Each hook used to hold its own copy hydrated in an effect, which meant
 * changing the avatar in Settings left the home screen and the route page
 * showing the old one until they remounted. A single store fixes that, and
 * `useSyncExternalStore` is the supported way to read browser state that the
 * server cannot see without a cascading render on mount.
 */
let snapshot: Settings | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Settings {
  // Cached: useSyncExternalStore compares by identity, so returning a freshly
  // parsed object every call would loop forever.
  if (snapshot === null) snapshot = read();
  return snapshot;
}

/** The server has no localStorage, so it always renders the defaults. */
function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(next: Settings): void {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Ignore: the change still applies for this session.
  }
  for (const listener of listeners) listener();
}

/**
 * Settings live entirely in the browser — the app requires no login, so there
 * is nothing to sync and nothing to leak.
 */
export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...getSnapshot(), ...patch };
    if (patch.theme) applyTheme(patch.theme);
    write(next);
  }, []);

  // True once the client has read localStorage. Callers use it to avoid
  // flashing default settings before the real ones are known.
  const loaded = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return { settings, update, loaded };
}
