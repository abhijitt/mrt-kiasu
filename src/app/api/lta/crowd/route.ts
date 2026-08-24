import { NextResponse } from "next/server";
import {
  TTL,
  getCrowdRealTime,
  isLtaConfigured,
  type CrowdLineCode,
} from "@/lib/lta";

/** Allow-list, so nothing user-supplied is ever interpolated into an upstream URL. */
const VALID_LINES: CrowdLineCode[] = [
  "CCL", "CEL", "CGL", "DTL", "EWL", "NEL",
  "NSL", "BPL", "SLRT", "PLRT", "TEL",
];

export async function GET(request: Request) {
  const line = new URL(request.url).searchParams.get("line")?.toUpperCase();

  if (!line || !VALID_LINES.includes(line as CrowdLineCode)) {
    return NextResponse.json(
      { error: `line must be one of: ${VALID_LINES.join(", ")}` },
      { status: 400 },
    );
  }

  if (!isLtaConfigured()) {
    // Not an error: the rest of the app works without live data, so say so
    // plainly rather than failing the request.
    return NextResponse.json(
      { configured: false, readings: [] },
      { status: 200 },
    );
  }

  try {
    const { data, stale, fetchedAt } = await getCrowdRealTime(line as CrowdLineCode);
    return NextResponse.json(
      { configured: true, stale, fetchedAt, readings: data },
      {
        headers: {
          // Let the CDN absorb repeat traffic too, and keep serving during a
          // revalidation rather than stalling the request.
          "Cache-Control": `public, s-maxage=${TTL.crowdRealTime}, stale-while-revalidate=${TTL.crowdRealTime * 2}`,
        },
      },
    );
  } catch (err) {
    console.error("[api/lta/crowd]", err);
    return NextResponse.json(
      { error: "Crowd data is unavailable right now." },
      { status: 502 },
    );
  }
}
