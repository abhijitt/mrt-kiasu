"use client";

import { useCallback, useSyncExternalStore } from "react";
import { addJourney, EMPTY_SCORE, type KiasuScore } from "./kiasu-score";

const KEY = "mrt-kiasu:score";

/**
 * The kiasu score, shared by every component that reads it.
 *
 * Same store pattern as the settings: one snapshot, cached, so a change in
 * one place is seen everywhere without each caller keeping a private copy.
 */
let snapshot: KiasuScore | null = null;
const listeners = new Set<() => void>();

function read(): KiasuScore {
  if (typeof window === "undefined") return EMPTY_SCORE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_SCORE;
    return { ...EMPTY_SCORE, ...(JSON.parse(raw) as Partial<KiasuScore>) };
  } catch {
    return EMPTY_SCORE;
  }
}

function getSnapshot(): KiasuScore {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): KiasuScore {
  return EMPTY_SCORE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: KiasuScore): void {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private browsing or blocked storage. The score is a nicety, not a
    // feature anything depends on.
  }
  for (const l of listeners) l();
}

export function useKiasuScore() {
  const score = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const record = useCallback((seconds: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const next = addJourney(getSnapshot(), seconds, today);
    // addJourney returns the same object when it rejects the input, so a
    // rejected figure writes nothing and notifies nobody.
    if (next !== getSnapshot()) commit(next);
  }, []);

  const reset = useCallback(() => commit(EMPTY_SCORE), []);

  return { score, record, reset };
}
