import { NextResponse } from "next/server";
import { TTL, getLiftMaintenance, isLtaConfigured } from "@/lib/lta";

export async function GET() {
  if (!isLtaConfigured()) {
    return NextResponse.json({ configured: false, outages: [] }, { status: 200 });
  }

  try {
    const { data, stale, fetchedAt } = await getLiftMaintenance();
    return NextResponse.json(
      { configured: true, stale, fetchedAt, outages: data },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${TTL.facilities}, stale-while-revalidate=${TTL.facilities * 2}`,
        },
      },
    );
  } catch (err) {
    console.error("[api/lta/lifts]", err);
    return NextResponse.json({ error: "Lift status is unavailable right now." }, { status: 502 });
  }
}
