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
 *
 * With no flags it lists the queue and changes nothing. Production and beta
 * point at different database branches, so review each where it lives.
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

function describe(row) {
  const f = row.feature;
  const who = row.name ? ` — ${row.name}` : "";
  const where = f.leadsTo?.length ? ` → ${f.leadsTo.join(", ")}` : "";
  const travel = f.travel ? ` (${f.travel})` : "";
  return (
    `  #${row.id}  ${row.station_code}:${row.direction}  ` +
    `${f.type}${travel} at door ${f.doorIndex}${where}` +
    `${who}\n` +
    `        submitted ${String(row.submitted_at).slice(0, 16).replace("T", " ")}` +
    `${row.env ? ` from ${row.env}` : ""}` +
    (row.note ? `\n        note: ${row.note}` : "")
  );
}

/**
 * Writes an approved feature into the dataset.
 *
 * Mirrors the development endpoint deliberately: re-surveying the same feature
 * at the same door updates it rather than stacking duplicates, and the list
 * stays ordered by door so a diff reads like the platform.
 */
async function applyToDataset(row) {
  const raw = JSON.parse(await readFile(POSITIONS, "utf8"));
  const key = `${row.station_code.toUpperCase()}:${row.direction}`;
  raw.platforms[key] ??= [];

  const feature = row.feature;
  const at = raw.platforms[key].findIndex(
    (f) => f.type === feature.type && f.doorIndex === feature.doorIndex,
  );
  if (at >= 0) raw.platforms[key][at] = feature;
  else raw.platforms[key].push(feature);

  raw.platforms[key].sort((a, b) => a.doorIndex - b.doorIndex);

  const all = Object.values(raw.platforms).flat();
  raw._status = {
    ...raw._status,
    surveyed: all.filter((f) => f.confidence === "verified").length,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };

  await writeFile(POSITIONS, JSON.stringify(raw, null, 2) + "\n");
  return { key, count: raw.platforms[key].length, surveyed: raw._status.surveyed };
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
  const result = await applyToDataset(row);
  await sql`
    UPDATE survey_submissions SET status = 'approved', reviewed_at = now() WHERE id = ${id}
  `;
  changed = true;
  console.log(
    `approved #${id} into ${result.key} (${result.count} on that platform, ` +
      `${result.surveyed} surveyed overall)`,
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
