/**
 * Imports MRT/LRT station exits from data.gov.sg.
 *
 * Source: LTA MRT Station Exit (GeoJSON)
 *   https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view
 *   Singapore Open Data Licence. No API key required.
 *
 * Usage: node scripts/import-exits.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATASET_ID = "d_b39d3a0871985372d7e1637193335da5";
const SOURCE_URL = `https://data.gov.sg/datasets/${DATASET_ID}/view`;
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "exits.json");

/**
 * LTA writes exit codes inconsistently: "Exit A", "Exit 1", bare "A", bare "1".
 * Normalise to the bare code, which is what appears on station signage.
 */
function normaliseExitCode(raw) {
  const code = String(raw ?? "").trim();
  const stripped = code.replace(/^exit\s+/i, "").trim().toUpperCase();
  return stripped || null;
}

/** "SERANGOON MRT STATION" -> "Serangoon", plus the station kind. */
function parseStationName(raw) {
  const name = String(raw ?? "").trim();
  const match = name.match(/^(.*?)\s+(MRT|LRT)\s+STATION$/i);
  if (!match) return { name: toTitleCase(name), kind: null };
  return { name: toTitleCase(match[1]), kind: match[2].toUpperCase() };
}

function toTitleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function main() {
  console.log("Requesting download URL from data.gov.sg…");
  const poll = await fetch(POLL_URL);
  if (!poll.ok) throw new Error(`poll-download failed: ${poll.status}`);
  const pollBody = await poll.json();
  const url = pollBody?.data?.url;
  if (!url) throw new Error(`No download URL in response: ${JSON.stringify(pollBody)}`);

  console.log("Downloading GeoJSON…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const geojson = await res.json();

  const features = geojson.features ?? [];
  console.log(`  ${features.length} exit features`);

  const stations = new Map();
  const skipped = [];

  for (const f of features) {
    const props = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    const code = normaliseExitCode(props.EXIT_CODE);
    const { name, kind } = parseStationName(props.STATION_NA);

    if (!code || !name || !Array.isArray(coords)) {
      skipped.push(props);
      continue;
    }

    const key = `${name}|${kind ?? "MRT"}`;
    if (!stations.has(key)) {
      stations.set(key, { station: name, kind: kind ?? "MRT", exits: [] });
    }
    stations.get(key).exits.push({
      code,
      lng: Number(coords[0].toFixed(7)),
      lat: Number(coords[1].toFixed(7)),
    });
  }

  // Stable ordering so re-imports produce clean diffs.
  const out = [...stations.values()].sort((a, b) =>
    a.station.localeCompare(b.station) || a.kind.localeCompare(b.kind),
  );
  for (const s of out) {
    s.exits.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  const payload = {
    _source: {
      dataset: "LTA MRT Station Exit",
      url: SOURCE_URL,
      licence: "Singapore Open Data Licence",
      importedAt: new Date().toISOString().slice(0, 10),
      featureCount: features.length,
    },
    stations: out,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote ${out.length} stations (${features.length - skipped.length} exits) to src/data/exits.json`);
  if (skipped.length) console.warn(`  skipped ${skipped.length} malformed features`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
