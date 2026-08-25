import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { isConfigured, saveReport } from "@/lib/reports-db";
import {
  sanitiseReport,
  validateReport,
  type ErrorReport,
} from "@/lib/report-types";

const LOCAL_FILE = join(process.cwd(), ".reports", "reports.jsonl");

/**
 * Receives an error report.
 *
 * Destinations, in order of preference:
 *   - DATABASE_URL set: stored in Postgres. Production and beta point at
 *     different database branches, so test submissions never mix with real
 *     ones.
 *   - REPORT_WEBHOOK_URL set: forwarded as JSON. Note that Slack and Discord
 *     webhooks will NOT work unmodified — they require their own payload
 *     shapes ({"text": ...} and {"content": ...}) and reject anything else,
 *     so point this at something that accepts arbitrary JSON, or put an
 *     adapter in front.
 *   - Otherwise, in development only: appended to .reports/reports.jsonl.
 *
 * With none of those this returns 501. Either way, a failure to store must
 * leave the reporter holding their text — see the status codes below, which
 * the form uses to decide whether to offer it back for copying.
 */
export async function POST(request: Request) {
  let body: Partial<ErrorReport>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const errors = validateReport(body);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Invalid report", details: errors }, { status: 400 });
  }

  const report = sanitiseReport(body);

  if (isConfigured()) {
    try {
      await saveReport(report);
      return NextResponse.json({ ok: true, delivered: "database" });
    } catch (err) {
      // Logged rather than returned: the reason may name the host or the
      // credential, and this response goes to the public internet.
      console.error("[api/report] database write failed", err);
      return NextResponse.json(
        { error: "Could not store the report.", retain: true },
        { status: 503 },
      );
    }
  }

  const webhook = process.env.REPORT_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
      return NextResponse.json({ ok: true, delivered: "webhook" });
    } catch (err) {
      console.error("[api/report] webhook failed", err);
      return NextResponse.json(
        { error: "Could not deliver the report.", retain: true },
        { status: 503 },
      );
    }
  }

  if (process.env.NODE_ENV !== "production") {
    await mkdir(join(process.cwd(), ".reports"), { recursive: true });
    await appendFile(LOCAL_FILE, JSON.stringify(report) + "\n");
    return NextResponse.json({ ok: true, delivered: "local" });
  }

  return NextResponse.json(
    { error: "No report destination is configured.", retain: true },
    { status: 501 },
  );
}
