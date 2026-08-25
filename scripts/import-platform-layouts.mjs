/**
 * Platform layouts from Wikipedia infoboxes.
 *
 * Which side the doors open follows from the layout, because Singapore runs
 * left-hand — so importing this removes most of the field survey rather than
 * merely getting a head start on it.
 *
 * Only unambiguous stations are written. Where a station's platforms are all
 * the same kind, every code there gets that layout. Where they differ — Bishan
 * is "1 island platform, 2 side platforms", one per line — the infobox does
 * not say which line has which, so nothing is recorded and the station is
 * listed for surveying. Guessing the assignment would produce a confident
 * answer about which side the doors open, wrong half the time, at exactly the
 * stations where being wrong is most likely.
 *
 *   npm run import:layouts
 */

import { readFile, writeFile } from "node:fs/promises";

const API = "https://en.wikipedia.org/w/api.php";
const positionsPath = new URL("../src/data/positions.json", import.meta.url);
const stationsPath = new URL("../src/data/stations.json", import.meta.url);

/** Wikipedia's wording for each arrangement. "Split platform" is stacked. */
const PATTERNS = [
  { re: /island platform/i, layout: "island" },
  { re: /side platform/i, layout: "side" },
  { re: /split platform/i, layout: "stacked" },
];

function layoutsIn(text) {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.layout);
}

async function fetchInfoboxes(titles) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "revisions");
  url.searchParams.set("rvprop", "content");
  url.searchParams.set("rvslots", "main");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("titles", titles.join("|"));

  const res = await fetch(url, {
    headers: { "user-agent": "mrt-kiasu/1.0 (platform layout import)" },
  });
  if (!res.ok) throw new Error(`Wikipedia responded ${res.status}`);
  const data = await res.json();

  const out = new Map();
  for (const page of data.query?.pages ?? []) {
    const content = page.revisions?.[0]?.slots?.main?.content;
    if (!content) continue;
    const m = content.match(/\|\s*platform[s]?\s*=\s*([^\n|]*)/i);
    if (m) out.set(page.title, m[1]);
  }
  return out;
}

const { stations } = JSON.parse(await readFile(stationsPath, "utf8"));

// One Wikipedia article per physical station, but codes are per line.
const byName = new Map();
for (const s of stations) {
  if (!byName.has(s.name)) byName.set(s.name, []);
  byName.get(s.name).push(s);
}

const names = [...byName.keys()];
const titleFor = (name, entries) =>
  `${name.replace(/ /g, "_")}_${entries.some((e) => /LRT/.test(e.line)) ? "LRT" : "MRT"}_station`;

const resolved = new Map();
for (let i = 0; i < names.length; i += 40) {
  const chunk = names.slice(i, i + 40);
  const titles = chunk.map((n) => titleFor(n, byName.get(n)));
  const found = await fetchInfoboxes(titles);
  for (const [j, name] of chunk.entries()) {
    const text = found.get(titles[j].replace(/_/g, " "));
    if (text) resolved.set(name, text);
  }
  // Polite to a free API we are not paying for.
  await new Promise((r) => setTimeout(r, 400));
}

const positions = JSON.parse(await readFile(positionsPath, "utf8"));
positions.layouts ??= {};

let written = 0;
const ambiguous = [];
const missing = [];

for (const [name, entries] of byName) {
  const text = resolved.get(name);
  if (!text) {
    missing.push(name);
    continue;
  }
  const kinds = [...new Set(layoutsIn(text))];
  if (kinds.length !== 1) {
    ambiguous.push(`${name} (${kinds.length === 0 ? "no layout stated" : kinds.join(" + ")})`);
    continue;
  }
  for (const s of entries) {
    positions.layouts[s.code] = {
      layout: kinds[0],
      source: "wikipedia",
      confidence: "verified",
      verifiedAt: new Date().toISOString().slice(0, 10),
      sourceNote: `Infobox at ${titleFor(name, entries).replace(/_/g, " ")}: ${text.replace(/\[\[|\]\]/g, "").trim()}`,
    };
    written++;
  }
}

positions._status.layoutsSurveyed = Object.keys(positions.layouts).length;
await writeFile(positionsPath, JSON.stringify(positions, null, 2) + "\n");

console.log(`layouts: ${written} platform codes across ${byName.size - ambiguous.length - missing.length} stations`);
console.log(`  needs a survey (mixed layouts): ${ambiguous.length}`);
ambiguous.slice(0, 12).forEach((a) => console.log(`     ${a}`));
if (missing.length) {
  console.log(`  no infobox found: ${missing.length}`);
  missing.slice(0, 8).forEach((m) => console.log(`     ${m}`));
}
