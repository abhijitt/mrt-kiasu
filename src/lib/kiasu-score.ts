/**
 * How much walking the app has actually saved you.
 *
 * Built only from figures already shown on the route screen, so it can never
 * claim more than the app has already justified. It lives entirely in the
 * browser — no account, nothing sent anywhere — which also means it is a
 * record of this device, not of you.
 */

export interface KiasuScore {
  /** Total seconds saved across every journey counted. */
  seconds: number;
  /** How many journeys contributed. */
  journeys: number;
  /** ISO date of the first journey counted, for "since" copy. */
  since: string;
}

export const EMPTY_SCORE: KiasuScore = { seconds: 0, journeys: 0, since: "" };

/**
 * Adds one journey.
 *
 * Pure so the accumulation rules are testable without a browser: a negative
 * or absurd figure must not be able to inflate the total, and `since` must
 * only ever be set once.
 */
export function addJourney(
  score: KiasuScore,
  seconds: number,
  today: string,
): KiasuScore {
  // Guard the total against a bad input rather than trusting the caller. A
  // number that cannot be justified on the route screen must not appear here.
  if (!Number.isFinite(seconds) || seconds <= 0) return score;
  const capped = Math.min(Math.round(seconds), MAX_PER_JOURNEY);

  return {
    seconds: score.seconds + capped,
    journeys: score.journeys + 1,
    since: score.since || today,
  };
}

/**
 * No single journey may contribute more than this.
 *
 * The longest train on the network is about 140m end to end, which is under
 * two minutes of walking. Anything larger is a bug upstream, and silently
 * absorbing it would turn a wrong number into a permanent one.
 */
export const MAX_PER_JOURNEY = 180;

/** Whole minutes, for copy that reads better than four-figure seconds. */
export function minutes(score: KiasuScore): number {
  return Math.floor(score.seconds / 60);
}
