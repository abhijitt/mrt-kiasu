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
 *   DATABASE_URL='...' node scripts/review-surveys.mjs --approve 3 --leads-to A,B,C
 *   DATABASE_URL='...' node scripts/review-surveys.mjs --confirm 5 --confirm 6
 *   DATABASE_URL='...' node scripts/review-surveys.mjs --reject 2 --because "..."
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
 * Exits and lines a reviewer fills in for a row that named none.
 *
 * A lift is the case that keeps arriving blank, and blank is not what the
 * surveyor meant: for anyone who needs a lift it is the only way out, so it
 * reaches every exit whether or not the form was told. Filling that in is
 * reviewer knowledge, not a survey, so it says so in the record.
 *
 * Only fills a blank. Replacing targets a surveyor did name would be
 * overruling them, which is a louder act than this flag should be able to do
 * quietly — reject the row and ask instead.
 */
function reviewerTargets() {
  const argv = process.argv.slice(2);
  const found = argv.flatMap((a, i) => (a === "--leads-to" ? [argv[i + 1]] : []));
  if (found.length === 0) return null;
  if (found.length > 1) {
    console.error("--leads-to can only be given once.");
    process.exit(1);
  }
  const targets = (found[0] ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (targets.length === 0) {
    console.error("--leads-to needs a comma-separated list, e.g. --leads-to A,B,C");
    process.exit(1);
  }
  if (approve.length === 0) {
    console.error("--leads-to does nothing without --approve.");
    process.exit(1);
  }
  return targets;
}

const fillTargets = reviewerTargets();

const confirm = idsFor("--confirm");

/**
 * Why the rows rejected in this run were rejected.
 *
 * Rejected rows are kept because a discarded claim is evidence — about the
 * platform, and about a surveyor whose next claim is worth weighing. Evidence
 * with no reason attached is much weaker evidence: "rejected" alone cannot
 * tell a careless reading apart from one that lost a close argument against
 * another survey, and the second is worth revisiting on the platform.
 */
function rejectionReason() {
  const argv = process.argv.slice(2);
  const found = argv.flatMap((a, i) => (a === "--because" ? [argv[i + 1]] : []));
  if (found.length === 0) return null;
  if (found.length > 1) {
    console.error("--because can only be given once.");
    process.exit(1);
  }
  const text = (found[0] ?? "").trim();
  if (!text || text.startsWith("--")) {
    console.error("--because needs a reason in quotes.");
    process.exit(1);
  }
  if (reject.length === 0) {
    console.error("--because does nothing without --reject.");
    process.exit(1);
  }
  return text;
}

const because = rejectionReason();

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
function today() {
  return new Date().toISOString().slice(0, 10);
}

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
  let feature = id ? { ...row.feature, id } : row.feature;
  if (fillTargets && (feature.leadsTo ?? []).length === 0) {
    feature = {
      ...feature,
      leadsTo: fillTargets,
      sourceNote:
        `${feature.sourceNote} — leadsTo filled in on review ${today()}: the ` +
        `survey named none, and a reviewer read it as reaching ${fillTargets.join(", ")}`,
    };
  }

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
    lastUpdated: today(),
  };

  await writeFile(POSITIONS, JSON.stringify(raw, null, 2) + "\n");
  return {
    key: keys.join(" + "),
    count: raw.platforms[keys[0]].length,
    surveyed: raw._status.surveyed,
    bothWays: keys.length > 1,
  };
}

/**
 * Whether a submission says the same thing as a record already held.
 *
 * Deliberately strict: a confirmation is the strongest evidence this dataset
 * can carry — two people, on different days, who have never seen each other's
 * answer — and it is worth nothing if it quietly tolerates a disagreement.
 * Anything that does not match exactly goes back to the reviewer to look at.
 */
function sameClaim(a, b) {
  const set = (x) => [...(x ?? [])].map((t) => String(t).toUpperCase()).sort().join(",");
  return (
    a.type === b.type &&
    a.doorIndex === b.doorIndex &&
    set(a.leadsTo) === set(b.leadsTo) &&
    (a.travel ?? null) === (b.travel ?? null) &&
    set(a.secondaryFor) === set(b.secondaryFor)
  );
}

/**
 * Records that someone else stood on the platform and saw the same thing.
 *
 * Approving this would be wrong twice over: it would overwrite a record with
 * an identical one, dragging verifiedAt backwards to the older survey, and it
 * would count a second sighting as a second feature. Rejecting it would be
 * worse — filing corroboration as a discredited claim. So it is its own
 * outcome, and what it changes is the one thing that actually improved: the
 * record now says two people saw it independently.
 *
 * The surveyor is not named. They gave a name to the form, not to a public
 * dataset, and "a second surveyor" carries the whole of the evidence.
 */
async function confirmInDataset(row) {
  const raw = JSON.parse(await readFile(POSITIONS, "utf8"));
  const key = `${row.station_code.toUpperCase()}:${row.direction}`;
  const held = (raw.platforms[key] ?? []).filter((f) => !f.impliedFrom);
  const match = held.find((f) => sameClaim(f, row.feature));

  if (!match) {
    const near = held.filter((f) => f.type === row.feature.type);
    return {
      ok: false,
      why: near.length
        ? `${key} holds ${near.map((f) => `${f.type} at door ${f.doorIndex}`).join(", ")}, ` +
          `not ${row.feature.type} at door ${row.feature.doorIndex}`
        : `${key} holds no surveyed ${row.feature.type} to confirm`,
    };
  }

  const already = / — independently confirmed/.test(match.sourceNote);
  if (!already) {
    match.sourceNote +=
      ` — independently confirmed on ${String(when(row.submitted_at)).slice(0, 10)} ` +
      `by a second surveyor`;
    await writeFile(POSITIONS, JSON.stringify(raw, null, 2) + "\n");
  }
  return { ok: true, key, already, feature: match };
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
  if (fillTargets && (row.feature.leadsTo ?? []).length > 0) {
    console.error(
      `#${id}: --leads-to would overrule the surveyor, who named ` +
        `${row.feature.leadsTo.join(", ")}. Reject the row and ask them instead.`,
    );
    continue;
  }
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

for (const id of confirm) {
  const row = await fetchOne(id);
  if (!row) {
    console.error(`#${id}: no such submission`);
    continue;
  }
  if (row.status !== "pending") {
    console.error(`#${id}: already ${row.status}, leaving it alone`);
    continue;
  }
  const result = await confirmInDataset(row);
  if (!result.ok) {
    // Never let a disagreement become a confirmation: the whole value of this
    // outcome is that a row which differs cannot reach it.
    console.error(`#${id}: does not match what is held — ${result.why}. Not confirmed.`);
    continue;
  }
  await sql`
    UPDATE survey_submissions SET status = 'confirmed', reviewed_at = now() WHERE id = ${id}
  `;
  changed = changed || !result.already;
  console.log(
    `confirmed #${id}: ${result.key} ${result.feature.type} at door ` +
      `${result.feature.doorIndex} independently seen by a second surveyor` +
      (result.already ? " (already noted)" : ""),
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
  const note = because
    ? `${row.note ? `${row.note}\n` : ""}[rejected ${today()}: ${because}]`
    : row.note;
  await sql`
    UPDATE survey_submissions
    SET status = 'rejected', reviewed_at = now(), note = ${note}
    WHERE id = ${id}
  `;
  console.log(
    `rejected #${id} (${row.station_code}:${row.direction})` + (because ? ` — ${because}` : ""),
  );
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
  console.log("  --confirm <id>   it agrees with what is held: note the second sighting");
  console.log("  --reject <id>    record the decision and leave the dataset alone");
  console.log("  --id <name>      approve several rows as one physical thing");
  console.log("  --leads-to <a,b> fill in the targets of an approved row that named none");
  console.log("  --because <why>  record why the rejected rows were rejected");
}
