import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { lineFromStationCode } from "@/lib/lines";
import { validateFeature, type PlatformFeature } from "@/lib/positions";
import { getStation } from "@/lib/stations";

const FILE = join(process.cwd(), "src", "data", "positions.json");

/**
 * Writes a surveyed position into the dataset.
 *
 * Deliberately development-only. The app needs no login, and an open write
 * endpoint on a public deployment would let anyone poison the one thing this
 * app promises is trustworthy. In production the survey UI shows the JSON for
 * the surveyor to submit through review instead.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error:
          "Survey writes are disabled in production. Copy the JSON and submit it for review.",
      },
      { status: 403 },
    );
  }

  let body: { stationCode?: string; direction?: string; feature?: Partial<PlatformFeature> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { stationCode, direction, feature } = body;

  if (!stationCode || !getStation(stationCode)) {
    return NextResponse.json({ error: `Unknown station "${stationCode}"` }, { status: 400 });
  }
  if (direction !== "asc" && direction !== "desc") {
    return NextResponse.json({ error: 'direction must be "asc" or "desc"' }, { status: 400 });
  }

  const line = lineFromStationCode(stationCode);
  if (!line) {
    return NextResponse.json(
      { error: `No sourced train geometry for ${stationCode}` },
      { status: 400 },
    );
  }

  const errors = validateFeature(feature ?? {}, line);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Invalid feature", details: errors }, { status: 400 });
  }

  const raw = JSON.parse(await readFile(FILE, "utf8"));
  const key = `${stationCode.toUpperCase()}:${direction}`;
  raw.platforms[key] ??= [];

  // Two escalators on one platform can serve different places — one to the
  // exit, one to the transfer corridor. If neither says where it leads, the
  // app has to pick between them, and picking is guessing. Enforced here as
  // well as in the form because this route accepts raw JSON.
  const siblings = (raw.platforms[key] as PlatformFeature[]).filter(
    (f) => f.type === feature!.type && f.doorIndex !== feature!.doorIndex,
  );
  if (siblings.length > 0 && (feature!.leadsTo ?? []).length === 0) {
    return NextResponse.json(
      {
        error: "Invalid feature",
        details: [
          `${key} already has another ${feature!.type}; leadsTo is required so they can be told apart`,
        ],
      },
      { status: 400 },
    );
  }

  // Re-surveying the same feature at the same door updates it rather than
  // stacking duplicates.
  const existing = raw.platforms[key].findIndex(
    (f: PlatformFeature) =>
      f.type === feature!.type && f.doorIndex === feature!.doorIndex,
  );
  if (existing >= 0) raw.platforms[key][existing] = feature;
  else raw.platforms[key].push(feature);

  raw.platforms[key].sort(
    (a: PlatformFeature, b: PlatformFeature) => a.doorIndex - b.doorIndex,
  );

  const all = Object.values(raw.platforms).flat() as PlatformFeature[];
  raw._status = {
    ...raw._status,
    surveyed: all.filter((f) => f.confidence === "verified").length,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };

  await writeFile(FILE, JSON.stringify(raw, null, 2) + "\n");

  return NextResponse.json({ ok: true, key, count: raw.platforms[key].length });
}
