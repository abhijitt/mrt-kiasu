/**
 * Imports LTA's fare distance for every pair of ADJACENT stations.
 *
 * Source: LTA Fare Calculator
 *   https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator.html
 *   The page posts to a .mrtget.html endpoint that answers with the trip's
 *   fare and its distance. There is no fare dataset on DataMall and no
 *   documented API, so this is the only official figure available.
 *
 * Why every pair, and not just adjacent hops
 * ------------------------------------------
 * Distance looks additive, so 209 adjacent hops ought to compose into all
 * 16,290 pairs. They do not. LTA rounds each hop to 0.1 km before publishing
 * it, and a journey of ten hops carries ten roundings, while their own figure
 * for the pair is rounded once from track data we cannot see. Measured over
 * 100 sampled journeys the sums drifted by up to 700 m and priced 7 of them
 * into the wrong band — so every pair is asked for directly.
 *
 * Why distance and not fare
 * -------------------------
 * The PTC revises fares roughly yearly (the current table began 27 Dec 2025).
 * Distances are track geometry and do not move, so storing them keeps a fare
 * revision to a one-line edit of the band table instead of a refetch.
 *
 * Usage: node scripts/import-fare-distances.mjs [--verify N] [--limit N]
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src", "data", "fare-distances.json");

const SOURCE_PAGE = "https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator.html";
const ENDPOINT =
  "https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator/jcr:content" +
  "/map2-content/farecalculator.mrtget.html";

/** Adult. The distance is the same for every fare type; only the price differs. */
const FARE_TYPE_ADULT = "30";

/**
 * The calculator's own station ids, read from the station <select> it builds
 * on load. They are not in the served HTML and there is no endpoint that
 * lists them, so they are pinned here; `--verify` fails loudly if one drifts.
 *
 * CE1 and CE2 are our codes for Bayfront and Marina Bay, which LTA lists under
 * their other codes (CC34 / DT16 and NS27 / TE20 / CC33).
 */
const LTA_STATION_ID = {
  BP1: "49",
  BP2: "50",
  BP3: "51",
  BP4: "52",
  BP5: "53",
  BP6: "306",
  BP7: "55",
  BP8: "56",
  BP9: "57",
  BP10: "58",
  BP11: "59",
  BP12: "60",
  BP13: "61",
  CC1: "10",
  CC2: "215",
  CC3: "214",
  CC4: "213",
  CC5: "212",
  CC6: "211",
  CC7: "210",
  CC8: "209",
  CC9: "35",
  CC10: "207",
  CC11: "206",
  CC12: "201",
  CC13: "106",
  CC14: "203",
  CC15: "3",
  CC16: "205",
  CC17: "216",
  CC19: "313",
  CC20: "218",
  CC21: "219",
  CC22: "220",
  CC23: "221",
  CC24: "222",
  CC25: "223",
  CC26: "224",
  CC27: "225",
  CC28: "226",
  CC29: "227",
  CC30: "231",
  CC31: "232",
  CC32: "233",
  CC33: "228",
  CC34: "229",
  CE1: "229",
  CE2: "228",
  CG1: "333",
  CG2: "65",
  DT1: "306",
  DT2: "307",
  DT3: "308",
  DT4: "336",
  DT5: "309",
  DT6: "310",
  DT7: "311",
  DT8: "312",
  DT9: "313",
  DT10: "314",
  DT11: "315",
  DT12: "111",
  DT13: "317",
  DT14: "31",
  DT15: "213",
  DT16: "229",
  DT17: "303",
  DT18: "304",
  DT19: "114",
  DT20: "318",
  DT21: "319",
  DT22: "320",
  DT23: "321",
  DT24: "322",
  DT25: "323",
  DT26: "207",
  DT27: "325",
  DT28: "326",
  DT29: "327",
  DT30: "328",
  DT31: "329",
  DT32: "330",
  DT33: "331",
  DT34: "332",
  DT35: "333",
  EW1: "42",
  EW2: "330",
  EW3: "40",
  EW4: "39",
  EW5: "38",
  EW6: "37",
  EW7: "36",
  EW8: "35",
  EW9: "34",
  EW10: "33",
  EW11: "32",
  EW12: "31",
  EW13: "11",
  EW14: "12",
  EW15: "14",
  EW16: "15",
  EW17: "16",
  EW18: "17",
  EW19: "18",
  EW20: "19",
  EW21: "220",
  EW22: "64",
  EW23: "21",
  EW24: "24",
  EW25: "25",
  EW26: "26",
  EW27: "27",
  EW28: "66",
  EW29: "67",
  EW30: "69",
  EW31: "70",
  EW32: "71",
  EW33: "72",
  NE1: "227",
  NE3: "15",
  NE4: "114",
  NE5: "113",
  NE6: "10",
  NE7: "111",
  NE8: "110",
  NE9: "109",
  NE10: "108",
  NE11: "107",
  NE12: "106",
  NE13: "105",
  NE14: "104",
  NE15: "103",
  NE16: "102",
  NE17: "101",
  NE18: "100",
  NS1: "24",
  NS2: "28",
  NS3: "29",
  NS4: "49",
  NS5: "48",
  NS7: "47",
  NS8: "46",
  NS9: "402",
  NS10: "44",
  NS11: "43",
  NS12: "73",
  NS13: "22",
  NS14: "23",
  NS15: "1",
  NS16: "2",
  NS17: "3",
  NS18: "4",
  NS19: "5",
  NS20: "6",
  NS21: "315",
  NS22: "8",
  NS23: "9",
  NS24: "10",
  NS25: "11",
  NS26: "12",
  NS27: "228",
  NS28: "68",
  PE1: "130",
  PE2: "131",
  PE3: "132",
  PE4: "133",
  PE5: "134",
  PE6: "135",
  PE7: "136",
  PTC: "101",
  PW1: "137",
  PW2: "138",
  PW3: "139",
  PW4: "140",
  PW5: "141",
  PW6: "142",
  PW7: "143",
  SE1: "117",
  SE2: "118",
  SE3: "119",
  SE4: "120",
  SE5: "121",
  STC: "102",
  SW1: "122",
  SW2: "123",
  SW3: "124",
  SW4: "125",
  SW5: "126",
  SW6: "127",
  SW7: "128",
  SW8: "129",
  TE1: "401",
  TE2: "402",
  TE3: "403",
  TE4: "404",
  TE5: "405",
  TE6: "406",
  TE7: "407",
  TE8: "408",
  TE9: "216",
  TE11: "314",
  TE12: "412",
  TE13: "413",
  TE14: "8",
  TE15: "415",
  TE16: "416",
  TE17: "15",
  TE18: "418",
  TE19: "419",
  TE20: "228",
  TE22: "422",
  TE23: "424",
  TE24: "425",
  TE25: "426",
  TE26: "427",
  TE27: "428",
  TE28: "429",
  TE29: "430",
};

/**
 * Seed for the calculator's trip accumulator. It carries distance and fare
 * across a multi-leg query; zeroed, it means "this is the first trip".
 */
const TRIP_INFO = [1, 2, 3, 4, 5, 6]
  .map((n) => `usiAccumulatedDistance${n}=0`)
  .concat([1, 2, 3, 4, 5, 6].map((n) => `usiAccumulatedFare${n}=0`))
  .join("-");

/**
 * Gap between requests.
 *
 * Measured rather than guessed: their endpoint answers in about 80 ms, and 20
 * back-to-back requests with no gap at all returned real data every time. So
 * 1200 ms was superstition. 400 ms keeps us to 2.5 requests a second — still
 * a fraction of what the server demonstrably tolerates, and it turns the whole
 * run into a couple of hours rather than a couple of days.
 */
const THROTTLE_MS = 400;

/**
 * A transient failure should cost one pair, never the whole run.
 *
 * The backoff used to be THROTTLE_MS * attempt * 5, written on a guess that
 * LTA was rate limiting us. They are not — the slow run was a sleeping laptop
 * — so this is now an ordinary 1s/2s/4s and a retry costs seconds, not a
 * minute.
 */
const RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the calculator for one journey.
 *
 * Returns centimetre-free integers exactly as LTA gives them: distance in
 * units of 10 m, fare in cents. Converting here would invent precision.
 */
async function fetchTrip(fromCode, toCode) {
  const from = LTA_STATION_ID[fromCode];
  const to = LTA_STATION_ID[toCode];
  if (!from || !to) throw new Error(`No LTA station id for ${!from ? fromCode : toCode}`);

  const body = new URLSearchParams({
    fare: FARE_TYPE_ADULT,
    from,
    to,
    tripInfo: TRIP_INFO,
    addTripInfo: "",
  });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: SOURCE_PAGE,
    },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${fromCode}->${toCode}`);

  const json = JSON.parse(await res.text());
  const distance = Number(json.distance);
  const fare = Number(json.fare);
  if (!Number.isFinite(distance) || !Number.isFinite(fare) || json.distance === "") {
    throw new Error(`Empty result for ${fromCode}->${toCode}: ${JSON.stringify(json)}`);
  }
  return { distance, fare };
}

/**
 * Codes that name the same physical station, collapsed to one.
 *
 * Marina Bay is NS27, CE2 and TE20; you are charged for one station, not
 * three. Grouping follows the interchange links already in stations.json and
 * takes the first code alphabetically as the name, so the key is stable
 * whichever code a caller happens to hold.
 */
export function canonicalCodes(stations) {
  const known = new Set(stations.map((s) => s.code));
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const s of stations) {
    find(s.code);
    for (const i of s.interchanges) if (known.has(i.code)) union(s.code, i.code);
  }

  const groups = new Map();
  for (const s of stations) {
    const root = find(s.code);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(s.code);
  }

  const canonical = new Map();
  for (const codes of groups.values()) {
    const name = [...codes].sort()[0];
    for (const c of codes) canonical.set(c, name);
  }
  return canonical;
}

const key = (a, b) => [a, b].sort().join("|");

async function loadStations() {
  const raw = JSON.parse(await readFile(join(root, "src", "data", "stations.json"), "utf8"));
  return raw.stations;
}

/**
 * The PTC band table, read the way src/lib/fare.ts reads it.
 *
 * Every response carries LTA's own fare beside the distance, so pricing each
 * pair as it arrives turns the whole file into its own test: if our band
 * lookup ever disagrees with what they charge, the import says so.
 */
async function loadBands() {
  const raw = JSON.parse(await readFile(join(root, "src", "data", "fare-bands.json"), "utf8"));
  const bands = raw.bands.adult;
  return (units) => {
    for (const [, toKm, cents] of bands) {
      if (toKm === null) return cents;
      if (units <= Math.round(toKm * 100)) return cents;
    }
    return bands[bands.length - 1][2];
  };
}

/** Counts what actually happened, so a slow run can be diagnosed rather than guessed at. */
const stats = { retries: 0, activeMs: 0, slowest: 0 };

async function fetchWithRetry(a, b) {
  let last;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const t0 = Date.now();
    try {
      const result = await fetchTrip(a, b);
      const took = Date.now() - t0;
      stats.activeMs += took;
      if (took > stats.slowest) stats.slowest = took;
      return result;
    } catch (err) {
      last = err;
      stats.retries++;
      stats.activeMs += Date.now() - t0;
      await sleep(BACKOFF_MS[attempt - 1] ?? 4000);
    }
  }
  throw last;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : Number(args[i + 1]);
  };
  const limit = flag("--limit");

  const stations = await loadStations();
  const canonical = canonicalCodes(stations);
  const priceOf = await loadBands();

  const names = [...new Set(canonical.values())].sort();
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) pairs.push([names[i], names[j]]);
  }

  let existing = {};
  let priorMismatches = [];
  try {
    const prior = JSON.parse(await readFile(OUT, "utf8"));
    existing = prior.pairs ?? {};
    priorMismatches = prior._fareMismatches ?? [];
  } catch {
    // First run.
  }

  const todo = pairs.filter(([a, b]) => existing[key(a, b)] === undefined);
  const hours = ((todo.length * THROTTLE_MS) / 3_600_000).toFixed(1);
  console.log(
    `${names.length} stations, ${pairs.length} pairs, ${todo.length} to fetch ` +
      `(${THROTTLE_MS}ms apart, about ${hours}h)`,
  );

  const distances = { ...existing };
  const failures = [];
  const mismatches = [...priorMismatches];
  const slice = limit ? todo.slice(0, limit) : todo;
  const started = Date.now();

  for (const [i, [a, b]] of slice.entries()) {
    try {
      const { distance, fare } = await fetchWithRetry(a, b);
      distances[key(a, b)] = distance;
      // Self-check, one pair at a time.
      if (priceOf(distance) !== fare) {
        mismatches.push({ pair: key(a, b), units: distance, ours: priceOf(distance), theirs: fare });
      }
    } catch (err) {
      failures.push({ pair: key(a, b), error: String(err.message ?? err) });
    }

    if ((i + 1) % 50 === 0) {
      const done = i + 1;
      // Estimated from request time plus our own throttle — NOT from the wall
      // clock. This machine slept through most of one night on battery, and a
      // wall-clock average turned a 5-hour job into a reported 40-hour one.
      const perPair = stats.activeMs / done + THROTTLE_MS;
      const left = ((slice.length - done) * perPair) / 3_600_000;
      const wall = (Date.now() - started) / 3_600_000;
      console.log(
        `  ${done}/${slice.length}  ~${left.toFixed(1)}h left  ` +
          `(${(stats.activeMs / done).toFixed(0)}ms/req, slowest ${stats.slowest}ms, ` +
          `${stats.retries} retries, ${wall.toFixed(1)}h wall)  ` +
          `${failures.length} failed  ${mismatches.length} fare mismatches`,
      );
      await save(distances, failures, mismatches, names.length);
    }
    await sleep(THROTTLE_MS);
  }

  await save(distances, failures, mismatches, names.length);
  console.log(`Done. ${Object.keys(distances).length}/${pairs.length} pairs stored.`);
  if (failures.length) console.log(`  ${failures.length} failed, rerun to fill them in.`);
  console.log(
    mismatches.length
      ? `  ${mismatches.length} pairs where our band lookup disagrees with LTA's fare`
      : "  Every fare we derive matches the one LTA charges.",
  );
}

async function save(pairs, failures, mismatches, stationCount) {
  const payload = {
    _source: {
      distances: SOURCE_PAGE,
      dataset: "LTA Fare Calculator (MRT/LRT trip distance)",
      note:
        "Distance in units of 10 m, exactly as LTA returns it, for every pair " +
        "of stations. Asked for pair by pair rather than summed from adjacent " +
        "hops: LTA rounds each hop to 0.1 km, and summing those roundings " +
        "drifted up to 700 m over a sample of 100 journeys, mispricing 7 of " +
        "them. Fares are not stored — the PTC revises them yearly and " +
        "fare-bands.json turns a distance into a price.",
      stations: stationCount,
      fetched: new Date().toISOString().slice(0, 10),
    },
    pairs,
    ...(failures?.length ? { _failures: failures } : {}),
    ...(mismatches?.length ? { _fareMismatches: mismatches } : {}),
  };
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
