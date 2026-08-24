import { NextResponse } from "next/server";
import {
  TTL,
  getCrowdForecast,
  isLtaConfigured,
  type CrowdLineCode,
} from "@/lib/lta";

const VALID_LINES: CrowdLineCode[] = [
  "CCL", "CEL", "CGL", "DTL", "EWL", "NEL",
  "NSL", "BPL", "SLRT", "PLRT", "TEL",
];

/** Today's crowding forecast in 30-minute steps, for one line. */
export async function GET(request: Request) {
  const line = new URL(request.url).searchParams.get("line")?.toUpperCase();

  if (!line || !VALID_LINES.includes(line as CrowdLineCode)) {
    return NextResponse.json(
      { error: `line must be one of: ${VALID_LINES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!isLtaConfigured()) {
    return NextResponse.json({ configured: false, forecast: [] }, { status: 200 });
  }

  try {
    const { data, stale, fetchedAt } = await getCrowdForecast(line as CrowdLineCode);
    return NextResponse.json(
      { configured: true, stale, fetchedAt, forecast: data },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${TTL.crowdForecast}, stale-while-revalidate=${TTL.crowdForecast * 2}`,
        },
      },
    );
  } catch (err) {
    console.error("[api/lta/forecast]", err);
    return NextResponse.json(
      { error: "Crowd forecast is unavailable right now." },
      { status: 502 },
    );
  }
}
