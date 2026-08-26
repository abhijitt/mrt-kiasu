import { NextResponse } from "next/server";
import adjustmentsData from "@/data/service-adjustments.json";
import { describeDrift, findDrift, isClean } from "@/lib/adjustment-drift";
import { getTrainServiceAlerts, isLtaConfigured } from "@/lib/lta";
import { saveReport } from "@/lib/reports-db";
import type { ServiceAdjustment } from "@/lib/service-adjustments";

/**
 * Daily watch on our hand-transcribed service adjustments.
 *
 * The replacement times in src/data/service-adjustments.json were read by a
 * person out of LTA's alert prose, so they go stale the moment LTA changes its
 * mind. This runs once a day, compares the two, and files a report when they
 * disagree. It deliberately cannot edit the data: changing a published time is
 * a judgement made against the alert text, and automating it would be exactly
 * the invented-data failure the file exists to prevent.
 *
 * Not cached — a monitor that answers from cache is not a monitor.
 *
 * Scheduled at 23:00 UTC, which is 07:00 the next morning in Singapore.
 * Vercel reads cron schedules in UTC, and the obvious-looking 05:00 SGT lands
 * exactly on the close of LTA's maintenance window: their notices put
 * DataMall maintenance between 00:00 and 05:00 SGT, so a run on that boundary
 * meets a half-woken API whenever one overruns. Two hours of margin, and
 * still early enough in the Singapore morning to be worth reading.
 */
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a secret configured the endpoint stays shut rather than open:
  // it reveals nothing sensitive, but an unauthenticated job that writes rows
  // to the reports table is a free way for anyone to fill it.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  if (!isLtaConfigured()) {
    return NextResponse.json({ checked: false, reason: "LTA key not configured" }, { status: 200 });
  }

  try {
    const { data } = await getTrainServiceAlerts();
    const adjustments = adjustmentsData.adjustments as ServiceAdjustment[];
    const drift = findDrift(data.Message ?? [], adjustments, new Date());
    const clean = isClean(drift);
    const summary = describeDrift(drift);

    if (!clean) {
      // Filed as a data report so it surfaces wherever every other data
      // problem does, rather than only in a log nobody reads.
      try {
        await saveReport({
          type: "data",
          message: summary,
          context: {
            path: "/api/cron/adjustments",
            locale: "en",
            subject: "service-adjustment-drift",
            reportedAt: new Date().toISOString(),
            env: process.env.VERCEL_ENV ?? "development",
          },
        });
      } catch (err) {
        // A missing DATABASE_URL must not turn a real finding into a 500 —
        // the drift still goes back in the response and into the log.
        console.error("[cron/adjustments] could not file report", err);
      }
      console.warn("[cron/adjustments] drift found\n" + summary);
    }

    return NextResponse.json({
      checked: true,
      clean,
      summary,
      unrecorded: drift.unrecorded.length,
      vanished: drift.vanished.map((a) => a.id),
      expired: drift.expired.map((a) => a.id),
      liveAlerts: drift.allAlerts.length,
    });
  } catch (err) {
    console.error("[cron/adjustments]", err);
    return NextResponse.json({ error: "Check failed" }, { status: 502 });
  }
}
