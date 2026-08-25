/**
 * Derives an octilinear ("metro map") layout from our own station coordinates.
 *
 * Why not just use the official map: LTA's system map is copyrighted, and the
 * layout — the angles, the loop shapes, the spacing — is the copyrighted part.
 * Reproducing it would be a derivative work. This arrives at a similar look
 * the way every metro map does, by applying the same design rules to the same
 * network, rather than by copying their answer.
 *
 * Why a schematic at all: at fit-to-screen on a phone, 341 pairs of stations
 * sit closer together than a tap target, and Bras Basah and Bencoolen are
 * 1.6px apart. Geography is unreadable in a city core, which is what Beck
 * worked out in 1933.
 *
 * The method is force relaxation under two constraints:
 *   1. every edge wants to lie on a multiple of 45 degrees
 *   2. no two stations may sit closer than a minimum spacing
 * run from the true geographic positions, so the result keeps the network's
 * real shape and orientation rather than inventing one.
 *
 * Deterministic: no randomness anywhere, so the same input always produces the
 * same layout and a diff means the data changed.
 *
 *   npm run build:schematic
 */

import { readFile, writeFile } from "node:fs/promises";

const mapPath = new URL("../src/data/map.json", import.meta.url);

/** Layout space. Matches the map component's viewBox. */
const W = 1000;
const H = 560;
const PAD = 40;

/** Closest two stations may sit, in layout units. */
const MIN_SPACING = 26;
/** How hard each constraint pulls per pass. Low enough to stay stable. */
const OCTILINEAR_FORCE = 0.5;
const SPACING_FORCE = 0.35;
/** Keeps the whole thing anchored near its true geography. */
const ANCHOR_FORCE = 0.001;
const PASSES = 3000;

const { stations, edges, unplaceable, _source } = JSON.parse(
  await readFile(mapPath, "utf8"),
);

// ---------------------------------------------------------------- projection

function mercator(lat, lng) {
  const rad = (lat * Math.PI) / 180;
  return { x: (lng * Math.PI) / 180, y: Math.log(Math.tan(Math.PI / 4 + rad / 2)) };
}

/**
 * One node per physical station.
 *
 * An interchange appears once per line in the dataset — Bishan is both NS17
 * and CC15 — but it is one place on a map, and the layout has to treat it as
 * one point or the lines will tear apart at every interchange.
 */
const byName = new Map();
for (const s of stations) {
  const p = mercator(s.lat, s.lng);
  let node = byName.get(s.name);
  if (!node) {
    node = { name: s.name, codes: [], sx: 0, sy: 0, mx: p.x, my: p.y };
    byName.set(s.name, node);
  }
  node.codes.push(s.code);
}
const nodes = [...byName.values()];
const nodeOf = new Map();
for (const s of stations) nodeOf.set(s.code, byName.get(s.name));

const xs = nodes.map((n) => n.mx);
const ys = nodes.map((n) => n.my);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const scale = Math.min((W - PAD * 2) / (maxX - minX), (H - PAD * 2) / (maxY - minY));
const offX = PAD + (W - PAD * 2 - (maxX - minX) * scale) / 2;
const offY = PAD + (H - PAD * 2 - (maxY - minY) * scale) / 2;

for (const n of nodes) {
  n.x = offX + (n.mx - minX) * scale;
  n.y = offY + (maxY - n.my) * scale;
  // Where geography says it belongs, so the layout can be pulled back toward
  // reality rather than drifting wherever the forces take it.
  n.ax = n.x;
  n.ay = n.y;
}

// ------------------------------------------------------------------- adjacency

const links = [];
const seen = new Set();
for (const [a, b] of edges) {
  const na = nodeOf.get(a);
  const nb = nodeOf.get(b);
  if (!na || !nb || na === nb) continue;
  const key = na.name < nb.name ? `${na.name}|${nb.name}` : `${nb.name}|${na.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  links.push([na, nb]);
}

// ------------------------------------------------------------------ relaxation

const OCT = Math.PI / 4;

function relax() {
  for (let pass = 0; pass < PASSES; pass++) {
    for (const n of nodes) {
      n.dx = 0;
      n.dy = 0;
    }

    // 1. Every edge wants to lie on a multiple of 45 degrees, at a length no
    //    shorter than the minimum spacing.
    for (const [a, b] of links) {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len = Math.hypot(vx, vy) || 1;
      const target = Math.round(Math.atan2(vy, vx) / OCT) * OCT;
      const want = Math.max(len, MIN_SPACING);
      const tx = Math.cos(target) * want;
      const ty = Math.sin(target) * want;
      // Half the correction to each end, so neither is privileged.
      const ex = (tx - vx) * OCTILINEAR_FORCE * 0.5;
      const ey = (ty - vy) * OCTILINEAR_FORCE * 0.5;
      a.dx -= ex; a.dy -= ey;
      b.dx += ex; b.dy += ey;
    }

    // 2. Nothing may crowd anything else. A uniform grid over the layout keeps
    //    this near-linear instead of comparing all 179^2 pairs.
    const cell = MIN_SPACING;
    const grid = new Map();
    for (const n of nodes) {
      const key = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(n);
    }
    for (const n of nodes) {
      const gx = Math.floor(n.x / cell);
      const gy = Math.floor(n.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          for (const m of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
            if (m === n) continue;
            const vx = m.x - n.x;
            const vy = m.y - n.y;
            const d = Math.hypot(vx, vy);
            if (d >= MIN_SPACING) continue;
            // Two stations exactly on top of each other have no direction to
            // separate along, so nudge deterministically by name order.
            const ux = d < 0.001 ? (n.name < m.name ? -1 : 1) : vx / d;
            const uy = d < 0.001 ? 0 : vy / d;
            const push = (MIN_SPACING - d) * SPACING_FORCE * 0.5;
            n.dx -= ux * push; n.dy -= uy * push;
            m.dx += ux * push; m.dy += uy * push;
          }
        }
      }
    }

    // 3. A gentle pull home, so the map still reads as Singapore.
    for (const n of nodes) {
      n.dx += (n.ax - n.x) * ANCHOR_FORCE;
      n.dy += (n.ay - n.y) * ANCHOR_FORCE;
    }

    for (const n of nodes) {
      n.x += n.dx;
      n.y += n.dy;
    }
  }
}

relax();

/**
 * Moved to the origin, but deliberately NOT rescaled.
 *
 * Relaxation grows the network until nothing is crowded. Squeezing the result
 * back into the original box — which the first version did — throws that away
 * exactly where it was needed, because the city centre is where the expansion
 * happened. The layout instead keeps its natural size and reports it, and the
 * map uses that as its viewBox, so MIN_SPACING means what it says on screen.
 */
let extent;
{
  const nx = nodes.map((n) => n.x);
  const ny = nodes.map((n) => n.y);
  const lo = { x: Math.min(...nx), y: Math.min(...ny) };
  const hi = { x: Math.max(...nx), y: Math.max(...ny) };
  for (const n of nodes) {
    // Rounded for the same reason the geographic projection is: Node and the
    // browser disagree on the last digits of a float, which breaks hydration.
    n.x = Math.round((n.x - lo.x + PAD) * 100) / 100;
    n.y = Math.round((n.y - lo.y + PAD) * 100) / 100;
  }
  extent = {
    w: Math.round((hi.x - lo.x + PAD * 2) * 100) / 100,
    h: Math.round((hi.y - lo.y + PAD * 2) * 100) / 100,
  };
}

// ------------------------------------------------------------------- reporting

let octilinear = 0;
let worstAngle = 0;
for (const [a, b] of links) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const off = Math.abs(angle - Math.round(angle / OCT) * OCT) * (180 / Math.PI);
  if (off < 5) octilinear++;
  worstAngle = Math.max(worstAngle, off);
}

let tooClose = 0;
let closest = Infinity;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
    closest = Math.min(closest, d);
    if (d < MIN_SPACING * 0.75) tooClose++;
  }
}

const schematic = {};
for (const n of nodes) schematic[n.name] = { x: n.x, y: n.y };

await writeFile(
  mapPath,
  JSON.stringify({
    _source: {
      ..._source,
      schematic:
        "Octilinear layout derived from the same coordinates by scripts/build-schematic.mjs. " +
        "Not traced from any published map.",
    },
    stations,
    edges,
    schematic,
    schematicExtent: extent,
    unplaceable,
  }) + "\n",
);

console.log(`schematic: ${nodes.length} stations, ${links.length} links`);
console.log(`  octilinear edges: ${octilinear}/${links.length} (${Math.round((octilinear / links.length) * 100)}%)`);
console.log(`  worst edge angle off 45°: ${worstAngle.toFixed(1)}°`);
console.log(`  closest pair: ${closest.toFixed(1)} units (min spacing ${MIN_SPACING})`);
console.log(`  pairs still crowded: ${tooClose}`);
console.log(`  natural extent: ${extent.w} x ${extent.h}`);
