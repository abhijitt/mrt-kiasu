/**
 * Reviews surveys submitted from platforms.
 *
 * A submission is a claim by a stranger about the one thing this app promises
 * is trustworthy, so nothing reaches src/data/positions.json until a person
 * has read it and said yes. This is that person's tool.
 *
 * Approving writes the feature into positions.json exactly as the development
 * endpoint would, and leaves it uncommitted — so the change goes through git,
 * through `npm run validate-data`, and past your own eyes before it is served
 * to anyone.
 *
 * Usage:
 *   DATABASE_URL='postgresql://...' node scripts/review-surveys.mjs
 *   DATABASE_URL='...' node scripts/review-surveys.mjs --approve 12 --approve 15
 *   DATABASE_URL='...' node scripts/review-surveys.mjs --reject 13
 *   DATABASE_URL='...' node scripts/review-surveys.mjs --approve 46 --approve 47 --id EW9-lift-1
 *
 * With no flags it lists the queue and changes nothing. Production and beta
 * point at different database branches, so review each where it lives.
 *
 * --id names the physical thing the approved rows describe. A surveyor on an
 * island platform sees one lift from both faces and submits it twice, because
 * its door faces one side and the best door differs; the form has no way to
 * say "these two are the same shaft". The reviewer does, and saying so is what
 * stops one lift from being stored as two.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const POSITIONS = join(root, "src", "data", "positions.json");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.\n");
  console.error("Put it in .env.local, which this script reads, or pass it inline:");
  console.error("  DATABASE_URL='postgresql://...' npm run surveys:review");
  process.exit(1);
}
const sql = neon(url);

/** Repeatable flags, so several submissions can be settled in one run. */
function idsFor(flag) {
  const out = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      const id = Number(argv[i + 1]);
      if (!Number.isInteger(id)) {
        console.error(`${flag} needs a submission id, got ${argv[i + 1] ?? "nothing"}`);
        process.exit(1);
      }
      out.push(id);
    }
  }
  return out;
}

const approve = idsFor("--approve");
const reject = idsFor("--reject");

/**
 * The id to stamp on everything approved in this run, linking the rows as one
 * physical thing. One per run on purpose: you would only ever link records
 * that describe the same object, and a flag that could name several at once
 * would mostly be a way to get them crossed.
 */
function sharedId() {
  const argv = process.argv.slice(2);
  const found = argv.flatMap((a, i) => (a === "--id" ? [argv[i + 1]] : []));
  if (found.length === 0) return null;
  if (found.length > 1) {
    console.error("--id can only be given once: it names one physical thing.");
    process.exit(1);
  }
  const [id] = found;
  if (!id || id.startsWith("--")) {
    console.error(`--id needs a value, got ${id ?? "nothing"}`);
    process.exit(1);
  }
  if (approve.length === 0) {
    console.error("--id does nothing without --approve.");
    process.exit(1);
  }
  return id;
}

const linkAs = sharedId();

/**
 * Every claim in the submission, because this is what a reviewer decides on.
 *
 * `secondaryFor` was missing here once, and the omission cost more than a
 * missing line: a surveyor had marked stairs as the long way to both exits,
 * the listing showed them as an ordinary way out at an improbable door, and
 * the reviewer went looking for a mistake that was never made. A field left
 * out of the summary reads as a field the surveyor left blank.
 */
function describe(row) {
  const f = row.feature;
  const who = row.name ? ` — ${row.name}` : "";
  const where = f.leadsTo?.length ? ` → ${f.leadsTo.join(", ")}` : "";
  const travel = f.travel ? ` (${f.travel})` : "";
  const demoted = f.secondaryFor?.length
    ? `\n        the long way to: ${f.secondaryFor.join(", ")}`
    : "";
  return (
    `  #${row.id}  ${row.station_code}:${row.direction}  ` +
    `${f.type}${travel} at door ${f.doorIndex}${where}` +
    `${who}${demoted}\n` +
    `        submitted ${when(row.submitted_at)}` +
    `${row.env ? ` from ${row.env}` : ""}` +
    (row.note ? `\n        note: ${row.note}` : "")
  );
}

/**
 * The driver hands back a Date for a timestamptz, not the ISO string this
 * once assumed — and slicing a Date's own format, then swapping "T" for a
 * space, ate the T in "Thu".
 */
function when(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

const OPPOSITE = { asc: "desc", desc: "asc" };

/**
 * Mirrors servesBothDirections() and sameFeature() in src/lib/feature-types.ts
 * and src/lib/orientation.ts, which carry the full reasoning. Kept in step by
 * hand, the way build-map-data.mjs keeps its copy of EXPLICIT_LINKS in step
 * with network.ts.
 */
function servesBothDirections(layout) {
  return layout?.layout === "island";
}

function sameFeature(a, b) {
  if (a.id && b.id) return a.id === b.id;
  if (a.id || b.id) return false;
  return a.type === b.type && a.doorIndex === b.doorIndex;
}

/** Replaces the record describing this same thing, or adds it. */
function put(raw, key, feature) {
  raw.platforms[key] ??= [];
  const at = raw.platforms[key].findIndex((f) => sameFeature(f, feature));
  if (at >= 0) raw.platforms[key][at] = feature;
  else raw.platforms[key].push(feature);
  raw.platforms[key].sort((a, b) => a.doorIndex - b.doorIndex);
}

/**
 * Writes an approved feature into the dataset.
 *
 * Mirrors the development endpoint deliberately: re-surveying the same feature
 * updates it rather than stacking duplicates, and the list stays ordered by
 * door so a diff reads like the platform.
 *
 * On an island platform the same physical escalator serves both faces, so the
 * other direction gets a copy — but marked `impliedFrom`, because nobody stood
 * there. A real survey of that face always wins over the inference, whichever
 * order the two are approved in, and the copy never overwrites one.
 *
 * The copy keeps the SAME doorIndex. It is stored from the low-code end and is
 * already direction-independent; mirroring it would move the feature to the
 * far end of the platform. Where the best door genuinely differs by direction —
 * a lift whose door faces one side — that is not a mirror but a second survey.
 * Approve both rows in one run under `--id`, and the second replaces the
 * inference standing in for the first instead of landing beside it. Separate
 * runs will not link them: the inference written by the earlier run carries no
 * id, and an unidentified record is never absorbed into an identified one.
 */
async function applyToDataset(row, id) {
  const raw = JSON.parse(await readFile(POSITIONS, "utf8"));
  const station = row.station_code.toUpperCase();
  // With an id, sameFeature() stops asking where the door is and starts asking
  // which thing this is — so a second survey of the one lift replaces the
  // inference standing in for it rather than landing beside it.
  const feature = id ? { ...row.feature, id } : row.feature;

  put(raw, `${station}:${row.direction}`, feature);
  const keys = [`${station}:${row.direction}`];

  if (servesBothDirections(raw.layouts?.[station])) {
    const otherKey = `${station}:${OPPOSITE[row.direction]}`;
    const there = (raw.platforms[otherKey] ?? []).find((f) => sameFeature(f, feature));
    // Only fill a gap, or refresh an earlier inference. Never overwrite a
    // record someone actually surveyed from that platform.
    if (!there || there.impliedFrom) {
      put(raw, otherKey, {
        ...feature,
        impliedFrom: row.direction,
        sourceNote:
          `${feature.sourceNote} — not surveyed from this platform; inferred from the ` +
          `${row.direction} survey because ${station} is an island platform`,
      });
      keys.push(otherKey);
    }
  }

  const all = Object.values(raw.platforms).flat();
  raw._status = {
    ...raw._status,
    surveyed: all.filter((f) => f.confidence === "verified" && !f.impliedFrom).length,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };

  await writeFile(POSITIONS, JSON.stringify(raw, null, 2) + "\n");
  return {
    key: keys.join(" + "),
    count: raw.platforms[keys[0]].length,
    surveyed: raw._status.surveyed,
    bothWays: keys.length > 1,
  };
}

async function fetchOne(id) {
  const rows = await sql`
    SELECT id, station_code, direction, feature, note, name, email, env,
           submitted_at, status
    FROM survey_submissions WHERE id = ${id}
  `;
  return rows[0] ?? null;
}

let changed = false;

/**
 * What the first approved row is. An id says "these are one thing", so a run
 * that links a lift to an escalator has a mistake in it, not an intention.
 */
let approvedType = null;

for (const id of approve) {
  const row = await fetchOne(id);
  if (!row) {
    console.error(`#${id}: no such submission`);
    continue;
  }
  if (row.status !== "pending") {
    console.error(`#${id}: already ${row.status}, leaving it alone`);
    continue;
  }
  approvedType ??= row.feature.type;
  if (linkAs && row.feature.type !== approvedType) {
    console.error(
      `#${id}: --id ${linkAs} would link a ${row.feature.type} to a ` +
        `${approvedType}, which cannot be the same thing. Approve it on its own.`,
    );
    continue;
  }
  const result = await applyToDataset(row, linkAs);
  await sql`
    UPDATE survey_submissions SET status = 'approved', reviewed_at = now() WHERE id = ${id}
  `;
  changed = true;
  console.log(
    `approved #${id} into ${result.key} (${result.count} on that platform, ` +
      `${result.surveyed} surveyed overall)` +
      (result.bothWays ? " — island platform, so the other side gets it as inferred" : "") +
      (linkAs ? ` — as ${linkAs}` : ""),
  );
}

for (const id of reject) {
  const row = await fetchOne(id);
  if (!row) {
    console.error(`#${id}: no such submission`);
    continue;
  }
  // Rows are never deleted: a rejected claim is evidence about the platform
  // and about who sent it, and a later claim that disagrees is worth comparing.
  await sql`
    UPDATE survey_submissions SET status = 'rejected', reviewed_at = now() WHERE id = ${id}
  `;
  console.log(`rejected #${id} (${row.station_code}:${row.direction})`);
}

const pending = await sql`
  SELECT id, station_code, direction, feature, note, name, env, submitted_at
  FROM survey_submissions
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT 200
`;

console.log(`\n${pending.length} pending submission(s)`);
for (const row of pending) console.log(describe(row));

if (changed) {
  console.log(
    "\npositions.json has been edited and is NOT committed.\n" +
      "  npm run validate-data   then read the diff before committing.",
  );
} else if (pending.length > 0) {
  console.log("\n  --approve <id>   write it into positions.json");
  console.log("  --reject <id>    record the decision and leave the dataset alone");
}
