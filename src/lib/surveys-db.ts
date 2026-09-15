import "server-only";
import { neon } from "@neondatabase/serverless";
import type { PlatformFeature } from "@/lib/feature-types";

/**
 * Storage for surveys submitted from a platform.
 *
 * Deliberately separate from the dataset. A submission is a claim by a
 * stranger about the one thing this app promises is trustworthy, so it is
 * stored as pending and reaches src/data/positions.json only when a person has
 * read it, approved it and committed it. Nothing here is ever served to a
 * commuter.
 *
 * `server-only` makes an accidental client import a build error rather than a
 * leaked database credential — the same guard the LTA client and the reports
 * store use.
 */

export interface SurveySubmission {
  stationCode: string;
  direction: "asc" | "desc";
  feature: PlatformFeature;
  /** Anything the surveyor wanted to add in their own words. */
  note?: string;
  /** Optional, so a surveyor can be credited or asked a follow-up question. */
  name?: string;
  email?: string;
  locale?: string;
  viewport?: string;
  /** "production" or "preview", so beta's test submissions are recognisable. */
  env?: string;
  submittedAt: string;
}

export interface PendingSubmission extends SurveySubmission {
  id: number;
  createdAt: string;
}

/** False when no database is wired up, so callers can fall back rather than throw. */
export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * Stores submissions as pending, all of them or none.
 *
 * One survey can describe several things at once, because one landing often
 * holds several: the escalator and the stairs beside it are one walk from the
 * train, and asking someone to fill the form twice for them is how a platform
 * ends up half recorded. They are still stored as separate rows — a reviewer
 * may well believe the escalator and doubt the stairs — but they arrive
 * together, so a half-written landing is never what the reviewer sees.
 *
 * Throws if the write fails, so the caller can keep the surveyor's work rather
 * than pretending it was delivered — someone standing on a platform has spent
 * real effort by this point.
 */
export async function saveSubmissions(submissions: SurveySubmission[]): Promise<void> {
  if (submissions.length === 0) return;
  const sql = client();
  // Tagged templates, so every value is a bound parameter. A submission is
  // untrusted input from the public internet and must never reach the database
  // as concatenated SQL.
  const writes = submissions.map(
    (submission) => sql`
      INSERT INTO survey_submissions
        (station_code, direction, feature, note, name, email, locale, viewport, env, submitted_at)
      VALUES (
        ${submission.stationCode.toUpperCase()},
        ${submission.direction},
        ${JSON.stringify(submission.feature)},
        ${submission.note ?? null},
        ${submission.name ?? null},
        ${submission.email ?? null},
        ${submission.locale ?? null},
        ${submission.viewport ?? null},
        ${submission.env ?? null},
        ${submission.submittedAt}
      )
    `,
  );
  await sql.transaction(writes);
}

/** One submission, by way of the batch above. */
export async function saveSubmission(submission: SurveySubmission): Promise<void> {
  await saveSubmissions([submission]);
}

/** The queue, oldest first: whoever surveyed a platform first is reviewed first. */
export async function listPending(limit = 100): Promise<PendingSubmission[]> {
  const sql = client();
  const rows = await sql`
    SELECT id, station_code, direction, feature, note, name, email, locale,
           viewport, env, submitted_at, created_at
    FROM survey_submissions
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    stationCode: String(r.station_code),
    direction: r.direction as "asc" | "desc",
    feature: r.feature as PlatformFeature,
    note: r.note ?? undefined,
    name: r.name ?? undefined,
    email: r.email ?? undefined,
    locale: r.locale ?? undefined,
    viewport: r.viewport ?? undefined,
    env: r.env ?? undefined,
    submittedAt: String(r.submitted_at),
    createdAt: String(r.created_at),
  }));
}

/**
 * Records what a reviewer decided.
 *
 * Rows are never deleted: a rejected submission is evidence about the platform
 * and about the person who sent it, and a second claim that disagrees with the
 * dataset is worth being able to look back at.
 */
export async function setStatus(
  id: number,
  status: "approved" | "rejected",
): Promise<void> {
  const sql = client();
  await sql`
    UPDATE survey_submissions
    SET status = ${status}, reviewed_at = now()
    WHERE id = ${id}
  `;
}
