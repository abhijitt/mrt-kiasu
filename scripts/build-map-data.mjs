/**
 * Generates the slim dataset the network map ships to the browser.
 *
 * stations.json is 133 KB and is deliberately blocked from the client bundle,
 * so the map cannot import it. This emits only what drawing needs — a point
 * and a name per station, plus the ride edges — which is small enough to send.
 *
 * Generated rather than hand-maintained so it cannot drift from the sourced
 * data. Re-run after any station or exit import:
 *
 *   npm run build:map
 */

import { readFile, writeFile } from "node:fs/promises";

const stationsPath = new URL("../src/data/stations.json", import.meta.url);
const outPath = new URL("../src/data/map.json", import.meta.url);

const { stations } = JSON.parse(await readFile(stationsPath, "utf8"));

/**
 * A station's position is the mean of its exits.
 *
 * The dataset gives coordinates per exit, not per station — there is no
 * official "station point". The centroid of the exits is the closest honest
 * approximation of where the station sits, and at map scale the spread between
 * exits is a couple of pixels.
 */
function centroid(exits) {
  const pts = (exits ?? []).filter(
    (e) => typeof e.lat === "number" && typeof e.lng === "number",
  );
  if (pts.length === 0) return null;
  return {
    lat: pts.reduce((a, e) => a + e.lat, 0) / pts.length,
    lng: pts.reduce((a, e) => a + e.lng, 0) / pts.length,
  };
}

/**
 * Where a station opened after LTA last published its exit dataset, the
 * station carries the GTFS stop coordinate instead. Less precise than the
 * centroid of real exits, and used only so a newly opened station is drawn
 * rather than silently missing from its own line.
 */
function point(station) {
  return centroid(station.exits) ?? station.coord ?? null;
}

const placed = [];
const unplaceable = [];

for (const s of stations) {
  const at = point(s);
  if (!at) {
    // Kept and reported rather than dropped: the map says these exist and
    // cannot be shown, instead of quietly pretending the network is smaller.
    unplaceable.push({ code: s.code, name: s.name, line: s.line });
    continue;
  }
  placed.push({
    code: s.code,
    name: s.name,
    line: s.line,
    lat: Number(at.lat.toFixed(5)),
    lng: Number(at.lng.toFixed(5)),
  });
}

/**
 * Ride edges, derived the same way the router derives them: consecutive
 * numbers within a code prefix, plus the junctions codes cannot express.
 *
 * Mirrored here rather than imported because lib/network.ts pulls in the full
 * station dataset, which is exactly what this file exists to avoid shipping.
 * The explicit links below must stay in step with EXPLICIT_LINKS there.
 */
const EXPLICIT_LINKS = [
  ["EW4", "CG1"],
  ["CC4", "CC34"],
  ["STC", "SE1"], ["STC", "SE5"],
  ["STC", "SW1"], ["STC", "SW8"],
  ["PTC", "PE1"], ["PTC", "PE7"],
  ["PTC", "PW1"], ["PTC", "PW7"],
  ["BP6", "BP13"],
];

function splitCode(code) {
  const m = /^([A-Z]+)(\d+)$/.exec(code);
  return m ? { prefix: m[1], number: Number(m[2]) } : null;
}

const known = new Set(placed.map((s) => s.code));
const byPrefix = new Map();
for (const s of placed) {
  const parts = splitCode(s.code);
  if (!parts) continue;
  if (!byPrefix.has(parts.prefix)) byPrefix.set(parts.prefix, []);
  byPrefix.get(parts.prefix).push({ ...s, number: parts.number });
}

const edges = [];
const seen = new Set();
function addEdge(a, b) {
  if (!known.has(a) || !known.has(b)) return;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push([a, b]);
}

for (const group of byPrefix.values()) {
  group.sort((x, y) => x.number - y.number);
  for (let i = 1; i < group.length; i++) addEdge(group[i - 1].code, group[i].code);
}
for (const [a, b] of EXPLICIT_LINKS) addEdge(a, b);

const out = {
  _source: {
    coordinates:
      "Mean of station exit coordinates from exits.json (LTA MRT Station Exit, data.gov.sg), " +
      "falling back to the GTFS stop coordinate for stations LTA has not yet added to that dataset",
    edges:
      "Derived from official station codes, mirroring src/lib/network.ts. Consecutive numbers within a prefix are consecutive stations; reserved gaps are skipped.",
    generatedBy: "scripts/build-map-data.mjs",
  },
  stations: placed,
  edges,
  unplaceable,
};

await writeFile(outPath, JSON.stringify(out) + "\n");

const bytes = JSON.stringify(out).length;
console.log(`map.json: ${placed.length} stations, ${edges.length} edges, ${(bytes / 1024).toFixed(1)} KB`);
if (unplaceable.length > 0) {
  console.log(
    `  ${unplaceable.length} cannot be placed (no exit coordinates): ` +
      unplaceable.map((s) => `${s.code} ${s.name}`).join(", "),
  );
}
