/**
 * Imports MRT/LRT station exits from data.gov.sg.
 *
 * Source: LTA MRT Station Exit (GeoJSON)
 *   https://data.gov.sg/datasets/d_b39d3a0871985372d7e1637193335da5/view
 *   Singapore Open Data Licence. No API key required.
 *
 * That file is authoritative but not complete, so a small sourced SUPPLEMENT
 * below fills exits it has not published yet. See the comment on it.
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

/**
 * Exits LTA's dataset does not carry yet.
 *
 * LTA's file is the primary source and stays authoritative wherever it has an
 * entry: nothing here overrides a code LTA already publishes. But the file goes
 * stale — the same way their station-code list did for Circle Line Stage 6 — and
 * a missing exit is not a harmless gap. It silently truncates `leadsTo` on every
 * surveyed platform feature, because the survey form can only offer codes this
 * dataset knows about.
 *
 * Each entry needs two independent sources before it goes in, and says so.
 */
const SUPPLEMENT = [
  {
    station: "Paya Lebar",
    kind: "MRT",
    code: "E",
    lng: 103.8928784,
    lat: 1.3178497,
    source: "osm+survey",
    evidence:
      "OSM node 13122104274 (railway=subway_entrance, ref=E, v1 2025-09-06), " +
      "corroborated by field survey 2026-09-15 naming Exit E from the EW8 platform.",
  },
  {
    station: "Paya Lebar",
    kind: "MRT",
    code: "F",
    lng: 103.8922981,
    lat: 1.3178521,
    source: "osm+survey",
    evidence:
      "OSM node 3986226733 (railway=subway_entrance, ref=F, v4 2025-09-06), " +
      "whose mapper noted 'no official letter i think'. The field survey of " +
      "2026-09-15 read it as F from the platform, which is the signage evidence " +
      "that note was missing.",
  },
  {
    station: "Telok Ayer",
    kind: "MRT",
    code: "D",
    lng: 103.8482623,
    lat: 1.2827647,
    source: "osm+survey",
    evidence:
      "OSM node 12629717594 (railway=subway_entrance, ref=D, wheelchair=yes, " +
      "v1 2025-03-02), corroborated by field survey 2026-09-24 naming Exits D " +
      "and E from the DT18 platform.",
  },
  {
    station: "Telok Ayer",
    kind: "MRT",
    code: "E",
    lng: 103.8475842,
    lat: 1.2827746,
    source: "osm+survey",
    evidence:
      "OSM node 13569227098 (railway=subway_entrance, ref=E, 'to ICON Link @ " +
      "Club Street', v1 2026-02-16) and Wikipedia's Telok Ayer article, which " +
      "dates that link to February 2026; corroborated by field survey " +
      "2026-09-24 naming Exit E from the DT18 platform.",
  },
];

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

  // Merged after LTA's own features so a code LTA publishes always wins.
  const supplemented = [];
  for (const extra of SUPPLEMENT) {
    const key = `${extra.station}|${extra.kind}`;
    const entry = stations.get(key);
    if (!entry) {
      console.warn(`  supplement: no LTA station "${key}", skipping exit ${extra.code}`);
      continue;
    }
    if (entry.exits.some((e) => e.code === extra.code)) {
      console.log(`  supplement: LTA now publishes ${key} exit ${extra.code} — dropping ours`);
      continue;
    }
    entry.exits.push({
      code: extra.code,
      lng: extra.lng,
      lat: extra.lat,
      source: extra.source,
    });
    supplemented.push(`${key}:${extra.code}`);
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
      supplement: SUPPLEMENT.map(({ station, kind, code, source, evidence }) => ({
        station,
        kind,
        code,
        source,
        evidence,
      })),
    },
    stations: out,
  };

  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(
    `Wrote ${out.length} stations (${features.length - skipped.length} from LTA, ` +
      `${supplemented.length} supplemented) to src/data/exits.json`,
  );
  if (supplemented.length) console.log(`  supplemented: ${supplemented.join(", ")}`);
  if (skipped.length) console.warn(`  skipped ${skipped.length} malformed features`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
