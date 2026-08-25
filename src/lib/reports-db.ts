import "server-only";
import { neon } from "@neondatabase/serverless";
import type { ErrorReport } from "@/lib/report-types";

/**
 * Storage for error reports.
 *
 * `server-only` makes an accidental client import a build error rather than a
 * leaked database credential — the same guard the LTA client uses.
 *
 * Neon's HTTP driver rather than a TCP pool: a serverless function may run in
 * many instances at once, and each would hold its own Postgres connection.
 * Postgres runs out of connections long before Vercel runs out of instances.
 * Over HTTP there is no connection to exhaust, and no pool to leak between
 * invocations.
 */

/** False when no database is wired up, so callers can fall back rather than throw. */
export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Stores one report. Throws if the write fails, so the caller can keep the
 * reporter's text rather than pretending it was delivered.
 */
export async function saveReport(report: ErrorReport): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = neon(url);
  const c = report.context;

  // Tagged template, so every value is sent as a bound parameter. A report is
  // untrusted text from the public internet and must never reach the database
  // as concatenated SQL.
  await sql`
    INSERT INTO reports (type, message, name, email, path, locale, subject, viewport, env, reported_at)
    VALUES (
      ${report.type},
      ${report.message},
      ${report.name ?? null},
      ${report.email ?? null},
      ${c.path},
      ${c.locale ?? null},
      ${c.subject ?? null},
      ${c.viewport ?? null},
      ${c.env ?? null},
      ${c.reportedAt}
    )
  `;
}
