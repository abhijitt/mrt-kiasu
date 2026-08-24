import { describe, expect, it } from "vitest";
import {
  GESTURES,
  IDLE_STATE,
  KEYS,
  KEY_IDLE_RESET_MS,
  TOUCH_IDLE_RESET_MS,
  advanceSequence,
  type SequenceState,
} from "./useKonami";

/**
 * Feeds a whole sequence, returning whether it completed.
 *
 * `gaps` sets the delay before the input at that index, so a test can describe
 * someone hunting for the keys rather than typing at machine speed.
 */
function enter(
  sequence: readonly string[],
  inputs: readonly string[],
  idleMs: number,
  gaps: Record<number, number> = {},
): boolean {
  let state: SequenceState = { ...IDLE_STATE, lastAt: 1_000_000 };
  let now = state.lastAt;
  let done = false;
  inputs.forEach((input, i) => {
    now += gaps[i] ?? 50;
    ({ state, done } = advanceSequence(state, sequence, input, idleMs, now));
  });
  return done;
}

describe("konami sequence", () => {
  it("unlocks on the full code", () => {
    expect(enter(KEYS, KEYS, KEY_IDLE_RESET_MS)).toBe(true);
    expect(enter(GESTURES, GESTURES, TOUCH_IDLE_RESET_MS)).toBe(true);
  });

  it("does not unlock on a wrong or partial code", () => {
    expect(enter(KEYS, KEYS.slice(0, -1), KEY_IDLE_RESET_MS)).toBe(false);
    expect(enter(KEYS, [...KEYS.slice(0, -1), "z"], KEY_IDLE_RESET_MS)).toBe(false);
  });

  it("survives someone hunting for the keys on an unfamiliar laptop", () => {
    // The reason this was reported broken: the old budget was 3s for both
    // paths, and the jump from the arrows to B and A takes longer than that.
    expect(enter(KEYS, KEYS, KEY_IDLE_RESET_MS, { 8: 8000, 9: 5000 })).toBe(true);
  });

  it("still expires a keyboard attempt that is genuinely abandoned", () => {
    expect(
      enter(KEYS, KEYS, KEY_IDLE_RESET_MS, { 9: KEY_IDLE_RESET_MS + 1 }),
    ).toBe(false);
  });

  it("keeps the tight budget for touch, where scrolling looks the same", () => {
    expect(
      enter(GESTURES, GESTURES, TOUCH_IDLE_RESET_MS, { 5: TOUCH_IDLE_RESET_MS + 1 }),
    ).toBe(false);
  });

  it("expires before reading the expected entry, not after", () => {
    // Regression: the expected entry used to be read from the pre-reset step,
    // so an input matching what the lapsed attempt was waiting for scored a
    // match and left progress at an index nobody had entered.
    const stale: SequenceState = { step: 5, lastAt: 0 }; // waiting on ArrowRight
    const { state, done } = advanceSequence(
      stale,
      KEYS,
      "ArrowRight",
      KEY_IDLE_RESET_MS,
      KEY_IDLE_RESET_MS + 1,
    );
    expect(done).toBe(false);
    // ArrowRight is not ArrowUp, so a lapsed attempt restarts at zero.
    expect(state.step).toBe(0);
  });

  it("treats a mismatched first input as the start of a fresh attempt", () => {
    // ...↑↑↓↓ then a stray ↑ should leave you one step in, not zero.
    const inputs = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowUp"];
    let state: SequenceState = { ...IDLE_STATE, lastAt: 1_000_000 };
    let now = state.lastAt;
    for (const input of inputs) {
      now += 50;
      ({ state } = advanceSequence(state, KEYS, input, KEY_IDLE_RESET_MS, now));
    }
    expect(state.step).toBe(1);
  });

  it("resets to zero rather than sticking after completing", () => {
    let state: SequenceState = { ...IDLE_STATE, lastAt: 1_000_000 };
    let now = state.lastAt;
    let done = false;
    for (const key of KEYS) {
      now += 50;
      ({ state, done } = advanceSequence(state, KEYS, key, KEY_IDLE_RESET_MS, now));
    }
    expect(done).toBe(true);
    expect(state.step).toBe(0);
  });
});
