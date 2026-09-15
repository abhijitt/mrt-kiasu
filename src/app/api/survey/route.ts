import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { lineFromStationCode } from "@/lib/lines";
import { validateFeature, type PlatformFeature } from "@/lib/positions";
import { getStation } from "@/lib/stations";
import { looksLikeEmail } from "@/lib/report-types";
import { isConfigured, saveSubmissions } from "@/lib/surveys-db";
import { DEVICE_TYPES } from "@/lib/feature-types";

/** Enough for a sentence of context, not enough to be a payload. */
const NOTE_MAX = 500;
const NAME_MAX = 80;
const EMAIL_MAX = 254;

// One survey describes one landing, and a landing holds at most one of each
// kind of device. Anything longer is not a surveyor.
const FEATURES_MAX = DEVICE_TYPES.length;

const FILE = join(process.cwd(), "src", "data", "positions.json");

/** Trims and caps a free-text field, or drops it when it is empty. */
function trim(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().slice(0, max);
  return clean.length > 0 ? clean : undefined;
}

/**
 * Receives a survey of a platform.
 *
 * In development it writes straight into src/data/positions.json, because the
 * person running it is the person maintaining the dataset.
 *
 * In production it stores the survey as PENDING and nothing more. The app
 * needs no login, so an endpoint that wrote to the dataset would let anyone
 * poison the one thing this app promises is trustworthy. A submission is a
 * claim, not data: it reaches positions.json only once a person has read it,
 * approved it with scripts/review-surveys.mjs and committed the result, where
 * the data gate checks it like everything else.
 *
 * It used to refuse outright and hand back JSON to copy, which meant every
 * survey from a real commuter ended at a wall of braces.
 *
 * Accepts either one `feature` or a list of `features` describing the same
 * door: the escalator and the stairs beside it are one landing and one walk,
 * and making that two submissions cost a real surveyor half a platform to the
 * rate limiter. The list is all-or-nothing.
 */
export async function POST(request: Request) {
  let body: {
    stationCode?: string;
    direction?: string;
    feature?: Partial<PlatformFeature>;
    features?: Partial<PlatformFeature>[];
    note?: string;
    name?: string;
    email?: string;
    locale?: string;
    viewport?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { stationCode, direction } = body;

  // `feature` is the older shape and still the one the dev endpoint writes.
  if (body.features !== undefined && !Array.isArray(body.features)) {
    return NextResponse.json({ error: "features must be an array" }, { status: 400 });
  }
  const features = body.features ?? (body.feature ? [body.feature] : []);
  if (features.length === 0) {
    return NextResponse.json({ error: "No feature given" }, { status: 400 });
  }
  if (features.length > FEATURES_MAX) {
    return NextResponse.json(
      { error: `At most ${FEATURES_MAX} features per survey` },
      { status: 400 },
    );
  }

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

  // Every one of them, and the batch fails as a unit: a landing stored with
  // its stairs missing because that row alone was malformed is a worse record
  // than no landing at all, because it looks complete.
  const errors = features.flatMap((f, i) => {
    const prefix = features.length > 1 ? `feature ${i + 1}: ` : "";
    return validateFeature(f ?? {}, line).map((e) => `${prefix}${e}`);
  });
  // Two rows of the same type at one door would be indistinguishable, and the
  // second would silently overwrite the first at approval time.
  const types = features.map((f) => f?.type);
  if (new Set(types).size !== types.length) {
    errors.push("features must not repeat a type");
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: "Invalid feature", details: errors }, { status: 400 });
  }

  // Optional, but if given it has to be usable — the only reason to hold an
  // address is to ask the surveyor a question, and one with a typo in it is
  // personal data we are keeping for nothing.
  const email = trim(body.email, EMAIL_MAX);
  if (email !== undefined && !looksLikeEmail(email)) {
    return NextResponse.json(
      { error: "Invalid feature", details: ["email does not look like an address"] },
      { status: 400 },
    );
  }

  // Production: store the claim, do not touch the dataset.
  if (process.env.NODE_ENV === "production") {
    if (!isConfigured()) {
      // Nowhere to put it, so say so rather than swallow the work. `retain`
      // tells the form to keep what the surveyor entered.
      return NextResponse.json(
        { error: "Surveys cannot be accepted right now.", retain: true },
        { status: 501 },
      );
    }
    try {
      const submittedAt = new Date().toISOString();
      await saveSubmissions(
        features.map((f) => ({
          stationCode,
          direction,
          feature: f as PlatformFeature,
          note: trim(body.note, NOTE_MAX),
          name: trim(body.name, NAME_MAX),
          email,
          locale: trim(body.locale, 16),
          viewport: trim(body.viewport, 24),
          // From the server, not the submitter. Beta's test surveys and real
          // ones are only distinguishable if the label cannot be forged.
          env: process.env.VERCEL_ENV ?? "development",
          submittedAt,
        })),
      );
      return NextResponse.json({ ok: true, pending: true, stored: features.length });
    } catch (err) {
      // Logged rather than returned: the reason may name the host or the
      // credential, and this response goes to the public internet.
      console.error("[api/survey] submission write failed", err);
      return NextResponse.json(
        { error: "Could not store the survey.", retain: true },
        { status: 503 },
      );
    }
  }

  const raw = JSON.parse(await readFile(FILE, "utf8"));
  const key = `${stationCode.toUpperCase()}:${direction}`;
  raw.platforms[key] ??= [];

  // Two escalators on one platform can serve different places — one to the
  // exit, one to the transfer corridor. If neither says where it leads, the
  // app has to pick between them, and picking is guessing. Enforced here as
  // well as in the form because this route accepts raw JSON.
  for (const f of features) {
    const siblings = (raw.platforms[key] as PlatformFeature[]).filter(
      (other) => other.type === f!.type && other.doorIndex !== f!.doorIndex,
    );
    if (siblings.length > 0 && (f!.leadsTo ?? []).length === 0) {
      return NextResponse.json(
        {
          error: "Invalid feature",
          details: [
            `${key} already has another ${f!.type}; leadsTo is required so they can be told apart`,
          ],
        },
        { status: 400 },
      );
    }
  }

  // Re-surveying the same feature at the same door updates it rather than
  // stacking duplicates.
  for (const f of features) {
    const existing = raw.platforms[key].findIndex(
      (other: PlatformFeature) => other.type === f!.type && other.doorIndex === f!.doorIndex,
    );
    if (existing >= 0) raw.platforms[key][existing] = f;
    else raw.platforms[key].push(f);
  }

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
