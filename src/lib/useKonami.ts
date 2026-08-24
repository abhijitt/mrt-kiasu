"use client";

import { useCallback, useEffect, useRef } from "react";

/** Up, up, down, down, left, right, left, right, B, A. */
export const KEYS = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

type Dir = "up" | "down" | "left" | "right" | "tap";

/**
 * The same sequence by touch: the eight swipes, then two taps standing in for
 * B and A.
 */
export const GESTURES: Dir[] = [
  "up", "up", "down", "down",
  "left", "right", "left", "right",
  "tap", "tap",
];

/** Minimum travel for a swipe to count, in CSS pixels. */
const SWIPE_MIN = 40;
/** Anything shorter than this is a tap, not a swipe. */
const TAP_MAX = 12;
/**
 * Gaps longer than these reset progress.
 *
 * Touch needs a tight window: ordinary scrolling is made of the very same
 * swipes, so without one a few minutes of normal use could accumulate into the
 * sequence by accident. The keyboard carries no such risk — nobody types
 * up-up-down-down-left-right-left-right-B-A without meaning to — and a tight
 * window there only punishes someone hunting for the keys on an unfamiliar
 * layout, which is exactly when the pauses are longest. They get their own
 * budgets, and their own clocks, so a swipe never expires a typed attempt.
 */
export const TOUCH_IDLE_RESET_MS = 3000;
export const KEY_IDLE_RESET_MS = 15000;

/** Progress through one sequence, and when it last advanced. */
export interface SequenceState {
  step: number;
  lastAt: number;
}

export const IDLE_STATE: SequenceState = { step: 0, lastAt: 0 };

/**
 * Feeds one input to a sequence.
 *
 * Pure, and exported, because every bug this has had lived here rather than in
 * the event plumbing — including one where a lapsed attempt compared the new
 * input against the entry the *old* attempt was waiting for, scoring a match on
 * the wrong index.
 */
export function advanceSequence(
  state: SequenceState,
  sequence: readonly string[],
  got: string,
  idleMs: number,
  now: number,
): { state: SequenceState; done: boolean } {
  // Expire first, then read the expected entry — never the other way round.
  const step = now - state.lastAt > idleMs ? 0 : state.step;

  let next: number;
  if (got === sequence[step]) next = step + 1;
  // A mismatch may still be a fresh first input.
  else next = got === sequence[0] ? 1 : 0;

  const done = next === sequence.length;
  return { state: { step: done ? 0 : next, lastAt: now }, done };
}

/**
 * Fires when the Konami code is entered, by keyboard or by touch.
 *
 * The keyboard-only version was unreachable on a phone, which is where this
 * app is actually used — so the swipe sequence is the primary path and the
 * keyboard is the desktop convenience, not the other way round.
 */
export function useKonami(onUnlock: () => void): void {
  const keys = useRef(IDLE_STATE);
  const gestures = useRef(IDLE_STATE);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  // Held in a ref so the listeners below can be registered once. Passing the
  // callback straight into the effect re-subscribed on every render, since
  // callers write it inline.
  const unlock = useRef(onUnlock);
  unlock.current = onUnlock;

  const advance = useCallback(
    (
      ref: React.RefObject<SequenceState>,
      sequence: readonly string[],
      got: string,
      idleMs: number,
    ) => {
      const { state, done } = advanceSequence(ref.current, sequence, got, idleMs, Date.now());
      ref.current = state;
      return done;
    },
    [],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never swallow input while someone is typing a station or a report.
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA"].includes(el.tagName)) return;

      const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (advance(keys, KEYS, got, KEY_IDLE_RESET_MS)) {
        unlock.current();
      }
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.changedTouches[0];
      start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    }

    function onTouchEnd(e: TouchEvent) {
      const from = start.current;
      start.current = null;
      if (!from) return;

      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA"].includes(el.tagName)) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      let dir: Dir | null = null;
      if (absX < TAP_MAX && absY < TAP_MAX) {
        dir = "tap";
      } else if (absX > absY && absX >= SWIPE_MIN) {
        dir = dx > 0 ? "right" : "left";
      } else if (absY >= SWIPE_MIN) {
        dir = dy > 0 ? "down" : "up";
      }
      // Anything in between is an ambiguous drag; ignore rather than reset,
      // so a slightly sloppy swipe does not punish the attempt.
      if (!dir) return;

      if (advance(gestures, GESTURES, dir, TOUCH_IDLE_RESET_MS)) {
        unlock.current();
      }
    }

    window.addEventListener("keydown", onKey);
    // Passive: this only observes. Scrolling must keep working normally.
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [advance]);
}
