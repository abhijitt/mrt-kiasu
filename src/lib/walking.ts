/**
 * How much walking a door position actually saves.
 *
 * The app asks people to trust that standing in the right place matters. This
 * turns that into a number in the currency they care about — seconds — using
 * the metre offset already stored on every estimate.
 *
 * Deliberately conservative and clearly caveated: it compares against the far
 * end of the train, which is the worst case rather than the average one, and
 * it inherits all the uncertainty of the estimate it is derived from.
 */

import { LINES, type LineCode } from "./lines";

/**
 * Comfortable platform walking pace in metres per second.
 *
 * Below the ~1.4 m/s used for open pavement: platforms are crowded, people
 * carry things, and nobody sprints past a platform screen door.
 */
export const WALKING_SPEED_MS = 1.2;

/** Sourced car lengths, matching scripts/estimate_positions.py. */
const DRIVING_CAR_M = 23.65;
const INTERMEDIATE_CAR_M = 22.8;

export function trainLengthM(line: LineCode): number | null {
  const train = LINES[line].train;
  if (!train) return null;
  return 2 * DRIVING_CAR_M + (train.cars - 2) * INTERMEDIATE_CAR_M;
}

/**
 * Seconds saved versus standing at the far end of the train.
 *
 * `offsetM` is signed distance from the train's centre, so the worst case for
 * a given position is the opposite end of the train.
 */
export function secondsSaved(offsetM: number, line: LineCode): number | null {
  const length = trainLengthM(line);
  if (length === null) return null;

  const half = length / 2;
  // Clamp: an estimate can sit slightly outside the train's footprint.
  const position = Math.max(-half, Math.min(half, offsetM));

  // Standing at the right spot, you walk roughly nothing. The worst you could
  // have done is board at the opposite end, which is `half + |position|` away
  // — so that whole distance is what the right position saves you.
  const savedMetres = half + Math.abs(position);

  return Math.round(savedMetres / WALKING_SPEED_MS);
}
