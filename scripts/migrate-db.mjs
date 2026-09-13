/**
 * Creates the reports table.
 *
 * Run once per database branch — production and beta each have their own, so
 * beta's test submissions never land in the real reports table:
 *
 *   DATABASE_URL='postgresql://...' node scripts/migrate-db.mjs
 *
 * Deliberately a script rather than something the API route does on first
 * write: a serverless function can run many instances at once, so a lazy
 * "create if missing" races with itself, and the credential the app runs with
 * should not need permission to alter the schema.
 *
 * Every statement is idempotent, so re-running it is safe.
 */

import { neon } from "@neondatabase/serverless";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.\n");
  console.error("Put it in .env.local, which this script reads, or pass it inline:");
  console.error("  DATABASE_URL='postgresql://...' npm run migrate:db");
  process.exit(1);
}

const sql = neon(url);

// `reported_at` is when the person pressed send; `created_at` is when we
// stored it. They differ if delivery is retried, and the gap is worth keeping.
await sql`
  CREATE TABLE IF NOT EXISTS reports (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type        text        NOT NULL,
    message     text        NOT NULL,
    name        text,
    email       text,
    path        text        NOT NULL,
    locale      text,
    subject     text,
    viewport    text,
    env         text,
    reported_at timestamptz NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  )
`;

// Reading the newest first is the only access pattern this table has.
await sql`CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC)`;

/**
 * Surveys submitted from a platform.
 *
 * Deliberately NOT the dataset. A submission is a claim by a stranger about
 * the one thing this app promises is trustworthy, so it lands here as pending
 * and reaches src/data/positions.json only when a person has approved it and
 * committed it. `status` is what separates the two.
 *
 * The feature is stored as jsonb rather than exploded into columns because it
 * is validated against the same code the app uses, and pulling it apart here
 * would mean two definitions of a platform feature that could drift.
 */
await sql`
  CREATE TABLE IF NOT EXISTS survey_submissions (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_code text        NOT NULL,
    direction    text        NOT NULL,
    feature      jsonb       NOT NULL,
    status       text        NOT NULL DEFAULT 'pending',
    note         text,
    name         text,
    email        text,
    locale       text,
    viewport     text,
    env          text,
    submitted_at timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    reviewed_at  timestamptz
  )
`;

// Review works through the pending queue oldest first, so the person who
// surveyed a platform first is not left waiting behind later submissions.
await sql`
  CREATE INDEX IF NOT EXISTS survey_submissions_pending_idx
  ON survey_submissions (status, created_at)
`;
// "What has been claimed about this platform" is the other question worth asking.
await sql`
  CREATE INDEX IF NOT EXISTS survey_submissions_platform_idx
  ON survey_submissions (station_code, direction)
`;
// Triage is per kind: "show me the data corrections" is the common question.
await sql`CREATE INDEX IF NOT EXISTS reports_type_idx ON reports (type)`;

const [{ count }] = await sql`SELECT count(*)::int AS count FROM reports`;
console.log(`reports table ready — ${count} row(s) currently stored.`);

const [{ pending, total }] = await sql`
  SELECT count(*) FILTER (WHERE status = 'pending')::int AS pending,
         count(*)::int AS total
  FROM survey_submissions
`;
console.log(
  `survey_submissions table ready — ${total} row(s), ${pending} awaiting review.`,
);
