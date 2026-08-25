/**
 * How long a journey actually takes.
 *
 * Replaces two invented constants. The app used to assume a flat 2.2 minutes
 * per stop and a flat 5 minutes per interchange, and modelled waiting for a
 * train as taking no time at all — as though one were always sitting at the
 * platform with its doors open.
 *
 * Every figure here except the transfer walk now comes from LTA's published
 * timetable. The walk has no source and says so.
 */

export interface HeadwayTable {
  /** line prefix -> service day -> hour -> median minutes between trains. */
  [line: string]: { [day: string]: { [hour: string]: number } };
}

export interface JourneyInputs {
  /** Station codes in order, as the router produced them. */
  path: readonly string[];
  /** Median run time per adjacent pair, keyed "A|B" with A < B. */
  hops: Record<string, number>;
  headway: HeadwayTable;
  /** Which timetable applies. */
  day: "weekday" | "saturday" | "sunday";
  /** Departure hour, 0-23. */
  hour: number;
  /** Interchanges on the route, as [fromCode, toCode] pairs. */
  transfers: readonly (readonly [string, string])[];
  /** Platform-to-platform walk, in minutes, already adjusted for pace. */
  transferWalkMinutes: number;
}

export interface JourneyBreakdown {
  /** Time on trains. */
  rideMinutes: number;
  /** Waiting on platforms, including for connections. */
  waitMinutes: number;
  /** Walking between platforms at interchanges. */
  walkMinutes: number;
  total: number;
  /** Hops with no timetable entry, so the caller can caveat honestly. */
  unknownHops: number;
}

/** Used only where the timetable has no entry for a hop. */
export const FALLBACK_HOP_MINUTES = 2;
/** Used only where a line has no headway for that hour. */
export const FALLBACK_HEADWAY_MINUTES = 6;

function lineOf(code: string): string {
  return code.replace(/\d+$/, "").toUpperCase();
}

function headwayFor(
  headway: HeadwayTable,
  code: string,
  day: string,
  hour: number,
): number {
  return headway[lineOf(code)]?.[day]?.[String(hour)] ?? FALLBACK_HEADWAY_MINUTES;
}

/**
 * Expected wait for a train, given how often they come.
 *
 * Half the headway: someone arriving at a random moment waits, on average,
 * half the gap. It is an average rather than a promise, which is why the UI
 * calls the total approximate.
 */
function expectedWait(headwayMinutes: number): number {
  return headwayMinutes / 2;
}

export function estimateJourney(input: JourneyInputs): JourneyBreakdown {
  const { path, hops, headway, day, hour, transfers, transferWalkMinutes } = input;

  let rideMinutes = 0;
  let unknownHops = 0;

  const transferPairs = new Set(
    transfers.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)),
  );

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    // A transfer is a walk between platforms, not a train ride.
    if (transferPairs.has(key)) continue;
    const hop = hops[key];
    if (hop === undefined) unknownHops++;
    rideMinutes += hop ?? FALLBACK_HOP_MINUTES;
  }

  // One wait to board at the start, plus one per connection.
  const boardings = [path[0], ...transfers.map(([, to]) => to)];
  const waitMinutes = boardings.reduce(
    (sum, code) => sum + expectedWait(headwayFor(headway, code, day, hour)),
    0,
  );

  const walkMinutes = transfers.length * transferWalkMinutes;

  return {
    rideMinutes: Math.round(rideMinutes),
    waitMinutes: Math.round(waitMinutes),
    walkMinutes: Math.round(walkMinutes),
    total: Math.round(rideMinutes + waitMinutes + walkMinutes),
    unknownHops,
  };
}
