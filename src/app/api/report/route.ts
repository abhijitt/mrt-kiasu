import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import {
  sanitiseReport,
  validateReport,
  type ErrorReport,
} from "@/lib/report-types";

const LOCAL_FILE = join(process.cwd(), ".reports", "reports.jsonl");

/**
 * Receives an error report.
 *
 * Two destinations, because the app has no backend of its own:
 *   - REPORT_WEBHOOK_URL set: forwarded there (Slack, Discord, Formspree, a
 *     Google Apps Script — anything that accepts a JSON POST).
 *   - Otherwise, in development only: appended to .reports/reports.jsonl.
 *
 * With neither, this returns 501 and the form falls back to copy-to-clipboard,
 * so a report is never silently swallowed. Unlike the survey endpoint this is
 * safe to leave open: a report is a message to us, not data the app serves
 * back to anyone.
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
        { error: "Could not deliver the report." },
        { status: 502 },
      );
    }
  }

  if (process.env.NODE_ENV !== "production") {
    await mkdir(join(process.cwd(), ".reports"), { recursive: true });
    await appendFile(LOCAL_FILE, JSON.stringify(report) + "\n");
    return NextResponse.json({ ok: true, delivered: "local" });
  }

  return NextResponse.json(
    { error: "No report destination is configured." },
    { status: 501 },
  );
}
