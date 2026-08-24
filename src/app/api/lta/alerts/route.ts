import { NextResponse } from "next/server";
import { TTL, getTrainServiceAlerts, isLtaConfigured } from "@/lib/lta";

export async function GET() {
  if (!isLtaConfigured()) {
    return NextResponse.json({ configured: false, alerts: null }, { status: 200 });
  }

  try {
    const { data, stale, fetchedAt } = await getTrainServiceAlerts();
    return NextResponse.json(
      {
        configured: true,
        stale,
        fetchedAt,
        disrupted: data.Status === 2,
        affectedSegments: data.AffectedSegments ?? [],
        messages: data.Message ?? [],
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${TTL.alerts}, stale-while-revalidate=${TTL.alerts * 5}`,
        },
      },
    );
  } catch (err) {
    console.error("[api/lta/alerts]", err);
    return NextResponse.json({ error: "Service alerts are unavailable right now." }, { status: 502 });
  }
}
