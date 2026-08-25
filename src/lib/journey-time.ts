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

// ---------------------------------------------------------------- exact mode

/** Sorted departure times, in minutes since midnight, per service day. */
export type DepartureTable = Record<string, Partial<Record<string, number[]>>>;

export interface Leg {
  /** Where you board. */
  boardAt: string;
  /** Which way, in the app's own terms. */
  direction: "asc" | "desc";
  /** Station codes travelled through on this leg, in order, including boardAt. */
  path: readonly string[];
}

export interface ExactInputs {
  legs: readonly Leg[];
  hops: Record<string, number>;
  departures: DepartureTable;
  day: "weekday" | "saturday" | "sunday";
  /** When you reach the first platform, in minutes since midnight. */
  arriveAt: number;
  /** Platform-to-platform walk at each interchange, already paced. */
  transferWalkMinutes: number;
}

export interface ExactBreakdown extends JourneyBreakdown {
  /** Actual boarding time of each leg, minutes since midnight. */
  boardTimes: number[];
  /** Wait before each leg — the number a kiasu commuter actually wants. */
  waitsPerLeg: number[];
  /** Arrival at the destination. */
  arriveMinutes: number;
  /** True when a leg had no timetable and fell back to an average. */
  approximated: boolean;
}

const DAY_MINUTES = 24 * 60;

/**
 * The next scheduled departure at or after `from`.
 *
 * Searches into the following operating day too, so someone arriving at
 * 01:30 is told about the 05:47 rather than being told there is nothing.
 */
function nextDeparture(times: number[], from: number): number | null {
  for (const t of times) if (t >= from) return t;
  // Wrapped: the first train of the next day.
  return times.length > 0 ? times[0] + DAY_MINUTES : null;
}

function rideMinutesFor(path: readonly string[], hops: Record<string, number>) {
  let total = 0;
  let unknown = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const hop = hops[key];
    if (hop === undefined) unknown++;
    total += hop ?? FALLBACK_HOP_MINUTES;
  }
  return { total, unknown };
}

/**
 * Walks the real timetable, train by train.
 *
 * This is the difference between "about three and a half minutes" and the
 * truth. If the connecting train leaves two minutes before you reach the
 * platform, you wait the whole gap — and that is exactly the case an average
 * hides, while being the case anyone rushing for a connection cares about.
 */
export function estimateJourneyExact(input: ExactInputs): ExactBreakdown {
  const { legs, hops, departures, day, arriveAt, transferWalkMinutes } = input;

  let clock = arriveAt;
  let rideMinutes = 0;
  let waitMinutes = 0;
  let walkMinutes = 0;
  let unknownHops = 0;
  let approximated = false;
  const boardTimes: number[] = [];
  const waitsPerLeg: number[] = [];

  legs.forEach((leg, index) => {
    if (index > 0) {
      walkMinutes += transferWalkMinutes;
      clock += transferWalkMinutes;
    }

    const times = departures[`${leg.boardAt}|${leg.direction}`]?.[day];
    const board = times && times.length > 0 ? nextDeparture(times, clock) : null;

    if (board === null) {
      // No timetable for this platform: fall back rather than refuse to answer,
      // and tell the caller the total is softer than it looks.
      approximated = true;
      const wait = FALLBACK_HEADWAY_MINUTES / 2;
      waitMinutes += wait;
      waitsPerLeg.push(Math.round(wait));
      boardTimes.push(Math.round(clock + wait));
      clock += wait;
    } else {
      const wait = board - clock;
      waitMinutes += wait;
      waitsPerLeg.push(Math.round(wait));
      boardTimes.push(board % DAY_MINUTES);
      clock = board;
    }

    const ride = rideMinutesFor(leg.path, hops);
    rideMinutes += ride.total;
    unknownHops += ride.unknown;
    clock += ride.total;
  });

  return {
    rideMinutes: Math.round(rideMinutes),
    waitMinutes: Math.round(waitMinutes),
    walkMinutes: Math.round(walkMinutes),
    total: Math.round(rideMinutes + waitMinutes + walkMinutes),
    unknownHops,
    boardTimes,
    waitsPerLeg,
    arriveMinutes: Math.round(clock) % DAY_MINUTES,
    approximated,
  };
}
