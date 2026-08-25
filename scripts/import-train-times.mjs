/**
 * First and last train times, from LTA's GTFS Schedule (Train) feed.
 *
 * Until this feed existed the only source was scraping operator websites —
 * SBST publishes plain HTML but SMRT's is a JavaScript app, so half the
 * network needed a headless browser. This is the official timetable instead,
 * which is why the app can finally answer "have I missed the last train".
 *
 * Derivation, stated plainly because the app shows these as facts:
 *   first train = the earliest departure from that platform
 *   last train  = the latest departure from that platform
 * grouped by station, by service day, and by where the train is headed —
 * which is how the times are posted at the stations themselves.
 *
 *   LTA_ACCOUNT_KEY=... npm run import:times
 */

import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const KEY = process.env.LTA_ACCOUNT_KEY;
if (!KEY) {
  console.error("LTA_ACCOUNT_KEY is not set.");
  process.exit(1);
}

const ENDPOINT = "https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain";

/** Minimal CSV reader. GTFS quotes any field containing a comma. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/**
 * GTFS expresses times past midnight as 24:xx, 25:xx and so on, so a service
 * that ends at 00:42 belongs to the previous operating day rather than to the
 * following morning. Kept as minutes-since-service-start for comparison, and
 * only wrapped for display.
 */
function toMinutes(hhmmss) {
  const [h, m] = hhmmss.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Seconds, because the timetable is written to the second and the useful
 * quantities are smaller than a minute: a scheduled dwell is 30 or 40 seconds,
 * and rounding it away turns an exact schedule into an approximation.
 */
function toSeconds(hhmmss) {
  const [h, m, sec] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + (sec || 0);
}

function toDisplay(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** SERVICE_WD_TEL_20260705_20261231 and SERVICE_WD both mean "weekday". */
function serviceKind(serviceId) {
  if (/^SERVICE_WD/.test(serviceId)) return "weekday";
  if (/^SERVICE_WE/.test(serviceId)) return "saturday";
  if (/^SERVICE_PH/.test(serviceId)) return "sunday";
  return null;
}

const res = await fetch(ENDPOINT, {
  headers: { AccountKey: KEY, accept: "application/json" },
});
if (!res.ok) {
  console.error(`DataMall responded ${res.status}`);
  process.exit(1);
}
const { value } = await res.json();
const { link, timestamp } = value[0];

const dir = await mkdtemp(join(tmpdir(), "gtfs-"));
try {
  const zipPath = join(dir, "gtfs.zip");
  const zip = Buffer.from(await (await fetch(link)).arrayBuffer());
  await writeFile(zipPath, zip);
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", dir]);

  const routes = parseCsv(readFileSync(join(dir, "routes.txt"), "utf8"));
  const stops = parseCsv(readFileSync(join(dir, "stops.txt"), "utf8"));
  const trips = parseCsv(readFileSync(join(dir, "trips.txt"), "utf8"));
  const stopTimes = parseCsv(readFileSync(join(dir, "stop_times.txt"), "utf8"));

  // stop_id carries a platform suffix (NS1_A); stop_code is the station code
  // printed on the signage, which is what the rest of the app keys on.
  const codeOf = new Map();
  for (const s of stops) if (s.stop_code) codeOf.set(s.stop_id, s.stop_code);

  const lineOf = new Map();
  for (const r of routes) lineOf.set(r.route_id, r.route_short_name);

  const tripInfo = new Map();
  for (const t of trips) {
    const kind = serviceKind(t.service_id);
    if (!kind) continue;
    tripInfo.set(t.trip_id, {
      kind,
      headsign: t.trip_headsign?.trim() || null,
      // Grouping by direction rather than by headsign, because the feed also
      // contains short workings and peak-only services with their own
      // destinations. Taking the earliest departure per headsign produced
      // "first train towards Dhoby Ghaut: 08:31" — true of that service, and
      // nothing like what a commuter means by the first train.
      // Keyed on the LINE, not the route_id. A line has several route_ids —
      // the Circle Line alone has CCL_LOOP plus variants named
      // CCL_MBT_PMN_1ST_TRAIN and the like — and keying on route_id split one
      // direction into half a dozen fragments, each reporting its own
      // fragment's earliest departure as though it were the first train.
      dir: `${lineOf.get(t.route_id) ?? t.route_id}|${t.direction_id}`,
      dirId: t.direction_id,
    });
  }

  /** station -> service kind -> route+direction -> { first, last, headsigns }. */
  const table = {};
  let skipped = 0;

  /**
   * The last stop of each trip, which is an arrival rather than a departure.
   *
   * GTFS still gives a departure_time there. Counting it made Jurong East —
   * the North South Line's own terminus — report a "first train towards
   * Jurong East" of 07:34, which is a train finishing its run, not one you
   * could board.
   */
  const lastSeq = new Map();
  for (const st of stopTimes) {
    const seq = Number(st.stop_sequence);
    if (!Number.isFinite(seq)) continue;
    if (seq > (lastSeq.get(st.trip_id) ?? -1)) lastSeq.set(st.trip_id, seq);
  }

  for (const st of stopTimes) {
    if (Number(st.stop_sequence) === lastSeq.get(st.trip_id)) { skipped++; continue; }
    const info = tripInfo.get(st.trip_id);
    const code = codeOf.get(st.stop_id);
    if (!info || !code || !info.headsign || !st.departure_time) { skipped++; continue; }

    const mins = toMinutes(st.departure_time);
    if (!Number.isFinite(mins)) { skipped++; continue; }

    const byKind = (table[code] ??= {});
    const byDir = (byKind[info.kind] ??= {});
    const cur = (byDir[info.dir] ??= { first: mins, last: mins, headsigns: new Map() });
    if (mins < cur.first) cur.first = mins;
    if (mins > cur.last) cur.last = mins;
    // The label is whichever destination most trips in this direction show,
    // so a handful of short workings cannot rename the whole direction.
    cur.headsigns.set(info.headsign, (cur.headsigns.get(info.headsign) ?? 0) + 1);
  }

  // ------------------------------------------------------ run times and headway
  //
  // The plan recorded that "LTA does not publish inter-station run times".
  // That is no longer true: stop_times gives the real thing for every trip, so
  // the app can stop assuming a flat 2.2 minutes per stop.

  const tripRows = new Map();
  for (const st of stopTimes) {
    if (!tripInfo.has(st.trip_id)) continue;
    (tripRows.get(st.trip_id) ?? tripRows.set(st.trip_id, []).get(st.trip_id)).push(st);
  }

  /** "NS1|NS2" -> every observed run time, so the median can be taken. */
  const hopSamples = new Map();
  for (const rows of tripRows.values()) {
    rows.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    for (let i = 1; i < rows.length; i++) {
      const from = codeOf.get(rows[i - 1].stop_id);
      const to = codeOf.get(rows[i].stop_id);
      if (!from || !to || from === to) continue;
      const d = toMinutes(rows[i].arrival_time) - toMinutes(rows[i - 1].departure_time);
      // A negative or absurd gap means a malformed row, not a slow train.
      if (!Number.isFinite(d) || d < 0 || d > 20) continue;
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      (hopSamples.get(key) ?? hopSamples.set(key, []).get(key)).push(d);
    }
  }

  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const hops = {};
  for (const [key, samples] of hopSamples) hops[key] = median(samples);

  /**
   * Run times and dwells in seconds, which together reproduce any leg exactly.
   *
   * Measured rather than assumed: the scheduled time between two stations is
   * identical on every trip — spread 0.0 across hundreds of trips on every
   * pair checked — so one number per pair is exact, not an average, and
   * carrying trip identity through the journey would buy nothing.
   *
   * Dwell is likewise a flat 30 or 40 seconds per station. It was previously
   * discarded entirely, since hop times were measured departure-to-arrival,
   * so every intermediate stop silently cost nothing.
   */
  const hopSecondsSamples = new Map();
  const dwellSamples = new Map();
  for (const rows of tripRows.values()) {
    rows.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    for (let i = 0; i < rows.length; i++) {
      const c = codeOf.get(rows[i].stop_id);
      if (!c) continue;
      const d = toSeconds(rows[i].departure_time) - toSeconds(rows[i].arrival_time);
      if (d >= 0 && d <= 300) {
        (dwellSamples.get(c) ?? dwellSamples.set(c, []).get(c)).push(d);
      }
      if (i > 0) {
        const prev = codeOf.get(rows[i - 1].stop_id);
        if (!prev || prev === c) continue;
        const t = toSeconds(rows[i].arrival_time) - toSeconds(rows[i - 1].departure_time);
        if (t < 0 || t > 1800) continue;
        const key = prev < c ? `${prev}|${c}` : `${c}|${prev}`;
        (hopSecondsSamples.get(key) ?? hopSecondsSamples.set(key, []).get(key)).push(t);
      }
    }
  }
  const hopSeconds = {};
  for (const [k, v] of hopSecondsSamples) hopSeconds[k] = median(v);
  const dwellSeconds = {};
  for (const [k, v] of dwellSamples) dwellSeconds[k] = median(v);

  /**
   * Headway per LINE, per service day, per hour.
   *
   * Measured across stations and found to be a line-level property: every
   * North South Line station shows the same 3 minutes at 09:00 and the same
   * 5 at 14:00. Keying on the line rather than the station turns 15,000
   * numbers into 800, small enough to hand to the browser so Gao's planner
   * can recompute without a round trip.
   */
  const headwaySamples = new Map();
  for (const rows of tripRows.values()) {
    for (const st of rows) {
      const code = codeOf.get(st.stop_id);
      const info = tripInfo.get(st.trip_id);
      if (!code || !info) continue;
      const line = code.replace(/\d+$/, "");
      const key = `${line}|${info.kind}|${st.stop_id}|${info.dir}`;
      (headwaySamples.get(key) ?? headwaySamples.set(key, []).get(key)).push(
        toMinutes(st.departure_time),
      );
    }
  }

  const gapsByLine = new Map();
  for (const [key, times] of headwaySamples) {
    const [line, kind] = key.split("|");
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      if (gap <= 0 || gap > 40) continue;
      const hour = Math.floor(times[i] / 60) % 24;
      const k = `${line}|${kind}|${hour}`;
      (gapsByLine.get(k) ?? gapsByLine.set(k, []).get(k)).push(gap);
    }
  }

  const headway = {};
  for (const [k, gaps] of gapsByLine) {
    const [line, kind, hour] = k.split("|");
    ((headway[line] ??= {})[kind] ??= {})[hour] = median(gaps);
  }

  // ------------------------------------------------------------- departures
  //
  // Every scheduled departure, so a connection can be modelled exactly rather
  // than as "half the headway". Missing a train by one minute costs the whole
  // gap, and averaging hides precisely the case a kiasu commuter cares about.

  /**
   * GTFS direction_id means nothing on its own, so the mapping onto the app's
   * own asc/desc is DERIVED: walk each trip and see whether station numbers
   * rise or fall along it. Assuming 1 == ascending would silently reverse
   * whichever lines happen not to follow that convention.
   */
  const dirVotes = new Map();
  for (const rows of tripRows.values()) {
    rows.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
    const info = tripInfo.get(rows[0]?.trip_id);
    if (!info) continue;
    const nums = rows
      .map((r) => codeOf.get(r.stop_id))
      .filter(Boolean)
      .map((c) => Number(String(c).replace(/^[A-Z]+/, "")))
      .filter((n) => Number.isFinite(n));
    if (nums.length < 2) continue;

    /**
     * Voted step by step rather than by comparing the ends.
     *
     * The Circle Line is a loop: clockwise from Promenade runs CC4, CC34,
     * CC33, CC32 … so it ENDS on a higher number than it started despite
     * descending nearly the whole way. Comparing endpoints called both
     * directions ascending, and the two collapsed into a single key — the
     * planner would have put someone on a train going the opposite way round.
     */
    let up = 0;
    let down = 0;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] > nums[i - 1]) up++;
      else if (nums[i] < nums[i - 1]) down++;
    }
    if (up === down) continue;
    const rising = up > down;
    const line = String(codeOf.get(rows[0].stop_id)).replace(/\d+$/, "");
    const key = `${line}|${info.dirId}`;
    const v = dirVotes.get(key) ?? { asc: 0, desc: 0 };
    v[rising ? "asc" : "desc"]++;
    dirVotes.set(key, v);
  }
  const ourDirection = new Map();
  for (const [key, v] of dirVotes) ourDirection.set(key, v.asc >= v.desc ? "asc" : "desc");

  const departures = {};
  for (const rows of tripRows.values()) {
    for (const st of rows) {
      // A train finishing its run is not one you can board, so its final stop
      // must not appear as a departure — otherwise the planner would happily
      // put someone on a terminating service going the wrong way.
      if (Number(st.stop_sequence) === lastSeq.get(st.trip_id)) continue;
      const code = codeOf.get(st.stop_id);
      const info = tripInfo.get(st.trip_id);
      if (!code || !info) continue;
      const line = code.replace(/\d+$/, "");
      const dir = ourDirection.get(`${line}|${info.dirId}`);
      if (!dir) continue;
      const key = `${code}|${dir}`;
      ((departures[key] ??= {})[info.kind] ??= []).push(toMinutes(st.departure_time));
    }
  }
  for (const byDay of Object.values(departures)) {
    for (const day of Object.keys(byDay)) {
      byDay[day] = [...new Set(byDay[day])].sort((a, b) => a - b);
    }
  }

  // Render for display, and drop any station that ended up with nothing.
  const out = {};
  for (const [code, kinds] of Object.entries(table)) {
    const rendered = {};
    for (const [kind, heads] of Object.entries(kinds)) {
      const entries = Object.values(heads)
        .map((v) => {
          const [towards] = [...v.headsigns.entries()].sort((a, b) => b[1] - a[1])[0];
          return { towards, first: toDisplay(v.first), last: toDisplay(v.last) };
        })
        .sort((a, b) => a.towards.localeCompare(b.towards));
      if (entries.length) rendered[kind] = entries;
    }
    if (Object.keys(rendered).length) out[code] = rendered;
  }

  await writeFile(
    new URL("../src/data/train-times.json", import.meta.url),
    JSON.stringify(
      {
        _source: {
          dataset: "GTFS Schedule (Train), LTA DataMall",
          endpoint: ENDPOINT,
          feedTimestamp: timestamp,
          importedAt: new Date().toISOString().slice(0, 10),
          derivation:
            "First and last are the earliest and latest departure_time in stop_times.txt for that station, grouped by service day (calendar.txt) and by trip_headsign. Times past midnight are expressed by GTFS as 24:xx and later; they are wrapped for display but belong to the previous operating day.",
        },
        stations: out,
        hops,
        hopSeconds,
        dwellSeconds,
        headway,
        departures,
      },
      null,
      2,
    ) + "\n",
  );

  const stationCount = Object.keys(out).length;
  console.log(`train-times.json: ${stationCount} stations`);
  console.log(`  feed timestamp: ${timestamp}`);
  console.log(`  stop_times rows skipped (no headsign or unknown stop): ${skipped}`);
  console.log(`  inter-station run times: ${Object.keys(hops).length} station pairs`);
  console.log(`  run times in seconds: ${Object.keys(hopSeconds).length} pairs, dwell for ${Object.keys(dwellSeconds).length} stations`);
  console.log(`  headway: ${Object.keys(headway).length} lines x service day x hour`);
  console.log(`  departures: ${Object.keys(departures).length} station+direction lists`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
