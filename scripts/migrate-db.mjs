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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.\n");
  console.error("Pass the connection string for the branch you want to migrate:");
  console.error("  DATABASE_URL='postgresql://...' node scripts/migrate-db.mjs");
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
// Triage is per kind: "show me the data corrections" is the common question.
await sql`CREATE INDEX IF NOT EXISTS reports_type_idx ON reports (type)`;

const [{ count }] = await sql`SELECT count(*)::int AS count FROM reports`;
console.log(`reports table ready — ${count} row(s) currently stored.`);
