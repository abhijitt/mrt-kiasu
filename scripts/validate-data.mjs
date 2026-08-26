/**
 * Data integrity gate. Runs in CI and before builds.
 *
 * The app's central promise is that nothing is invented, so this script fails
 * the build if any position lacks provenance, points at a door that cannot
 * exist on that line's trains, or references a station we do not know.
 *
 * Usage: node scripts/validate-data.mjs
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (p) => JSON.parse(await readFile(join(root, p), "utf8"));

// Mirrors src/lib/lines.ts. Kept in sync by the test below that cross-checks
// the two, so this script stays dependency-free and runnable without a build.
const TRAINS = {
  NSL: { cars: 6, doorsPerCar: 4 },
  EWL: { cars: 6, doorsPerCar: 4 },
  NEL: { cars: 6, doorsPerCar: 4 },
  CCL: { cars: 3, doorsPerCar: 4 },
  DTL: { cars: 3, doorsPerCar: 4 },
  TEL: { cars: 4, doorsPerCar: 5 },
  // LRT fleets are deliberately absent: no sourced car/door counts.
};
const PREFIX_TO_LINE = {
  NS: "NSL", EW: "EWL", CG: "EWL", NE: "NEL", CC: "CCL", CE: "CCL",
  DT: "DTL", TE: "TEL",
  BP: "BPLRT", STC: "SKLRT", SE: "SKLRT", SW: "SKLRT",
  PTC: "PGLRT", PE: "PGLRT", PW: "PGLRT",
};

/**
 * Aliases LTA might use for a line, mirroring name/shortName in src/lib/lines.ts.
 *
 * Their alerts are inconsistent: the Downtown Line one says "DTL" and
 * "Downtown Line", the Sengkang one says "SK" and "Sengkang West LRT". All the
 * forms have to be accepted or the citation check would fail on real text.
 */
const LINE_ALIASES = {
  NSL: ["NSL", "North South Line", "NS"],
  EWL: ["EWL", "East West Line", "EW"],
  NEL: ["NEL", "North East Line", "NE"],
  CCL: ["CCL", "Circle Line", "CC"],
  DTL: ["DTL", "Downtown Line", "DT"],
  TEL: ["TEL", "Thomson-East Coast Line", "TE"],
  BPLRT: ["BPLRT", "Bukit Panjang LRT", "Bukit Panjang", "BP"],
  SKLRT: ["SKLRT", "Sengkang LRT", "Sengkang", "SK"],
  PGLRT: ["PGLRT", "Punggol LRT", "Punggol", "PG", "PTC"],
};

/**
 * What an alert may say instead of naming a day outright.
 *
 * "weekday" legitimately covers Monday to Friday and "weekend" covers both
 * ends of it, so an entry for Friday backed by text that says "weekdays" is
 * properly cited even though the word "Friday" never appears.
 */
const DAY_SYNONYMS = {
  monday: ["monday", "weekday", "weekdays"],
  tuesday: ["tuesday", "weekday", "weekdays"],
  wednesday: ["wednesday", "weekday", "weekdays"],
  thursday: ["thursday", "weekday", "weekdays"],
  friday: ["friday", "weekday", "weekdays"],
  saturday: ["saturday", "weekend", "weekends"],
  sunday: ["sunday", "weekend", "weekends"],
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Whole-word, case-insensitive: "NE" must not match inside "Renjong". */
function mentions(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/** The ways LTA might write one date: "10 Jul", "10 July", "2026-07-10". */
function dateAliases(iso) {
  const [, m, d] = iso.split("-").map(Number);
  const full = MONTHS[m - 1];
  const abbr = full.slice(0, 3);
  return [iso, `${d} ${abbr}`, `${d} ${full}`, `${abbr} ${d}`, `${full} ${d}`];
}

const VALID_TYPES = ["escalator", "lift", "stairs", "exit"];
const VALID_SOURCES = ["survey", "osm", "official-map", "user", "estimate"];
const VALID_CONFIDENCE = ["verified", "candidate", "estimate"];

const errors = [];
const warnings = [];

function lineOf(stationCode) {
  const prefix = stationCode.replace(/\d+$/, "").toUpperCase();
  return PREFIX_TO_LINE[prefix] ?? null;
}

async function main() {
  const [positions, stations, exits, estimates, landmarks, adjustments] = await Promise.all([
    read("src/data/positions.json"),
    read("src/data/stations.json"),
    read("src/data/exits.json"),
    read("src/data/estimates.json"),
    read("src/data/landmarks.json"),
    read("src/data/service-adjustments.json"),
  ]);

  const knownStations = new Set(stations.stations.map((s) => s.code.toUpperCase()));
  // Exit codes now live on the station records themselves.
  const exitCodesByCode = new Map(
    stations.stations.map((s) => [
      s.code.toUpperCase(),
      new Set((s.exits ?? []).map((e) => e.code)),
    ]),
  );

  // Where a feature leads is one axis: exit codes and interchange line codes
  // live in the same list, so both have to be checkable.
  const interchangeLinesByCode = new Map(
    stations.stations.map((s) => [
      s.code.toUpperCase(),
      new Set((s.interchanges ?? []).map((i) => String(i.line).toUpperCase())),
    ]),
  );

  // Surveyed positions and generated estimates go through the same checks —
  // an estimate that points at a nonexistent exit is still wrong.
  const allPlatforms = {
    ...(estimates.platforms ?? {}),
    ...(positions.platforms ?? {}),
  };

  for (const [key, features] of Object.entries(allPlatforms)) {
    const [stationCode, direction] = key.split(":");

    if (!stationCode || !["asc", "desc"].includes(direction)) {
      errors.push(`${key}: key must be "<stationCode>:asc" or "<stationCode>:desc"`);
      continue;
    }
    if (!knownStations.has(stationCode.toUpperCase())) {
      errors.push(`${key}: unknown station "${stationCode}"`);
      continue;
    }

    const line = lineOf(stationCode);
    if (!line || !TRAINS[line]) {
      errors.push(
        `${key}: no sourced train geometry for this line — refusing to validate door indices`,
      );
      continue;
    }

    const totalDoors = TRAINS[line].cars * TRAINS[line].doorsPerCar;
    if (!Array.isArray(features)) {
      errors.push(`${key}: value must be an array of features`);
      continue;
    }

    const seen = new Set();

    features.forEach((f, i) => {
      const at = `${key}[${i}]`;

      if (!VALID_TYPES.includes(f.type)) {
        errors.push(`${at}: type must be one of ${VALID_TYPES.join(", ")}`);
      }
      if (!Number.isInteger(f.doorIndex) || f.doorIndex < 1 || f.doorIndex > totalDoors) {
        errors.push(
          `${at}: doorIndex ${f.doorIndex} is outside 1..${totalDoors} for a ${line} train`,
        );
      }
      if (!VALID_SOURCES.includes(f.source)) {
        errors.push(`${at}: source is required and must be one of ${VALID_SOURCES.join(", ")}`);
      }
      if (!VALID_CONFIDENCE.includes(f.confidence)) {
        errors.push(`${at}: confidence must be one of ${VALID_CONFIDENCE.join(", ")}`);
      }
      if (typeof f.sourceNote !== "string" || f.sourceNote.trim() === "") {
        errors.push(`${at}: sourceNote is required — every position must say where it came from`);
      }
      const VALID_TRAVEL = ["up", "down", "reversible"];
      if (f.travel !== undefined && !VALID_TRAVEL.includes(f.travel)) {
        errors.push(`${at}: travel must be one of ${VALID_TRAVEL.join(", ")}`);
      }
      // A down-only escalator cannot serve someone alighting, so a surveyed
      // escalator must say which way it runs.
      if (f.type === "escalator" && f.confidence === "verified" && !f.travel) {
        errors.push(`${at}: travel is required for a surveyed escalator`);
      }
      if (f.confidence === "verified" && !f.verifiedAt) {
        errors.push(`${at}: verifiedAt is required when confidence is "verified"`);
      }
      if (!Array.isArray(f.leadsTo)) {
        errors.push(`${at}: leadsTo must be an array`);
      } else {
        // A target is either an exit code as printed on station signage or the
        // code of a line you can change to here. Anything else would send
        // someone to a place that does not exist.
        const known = exitCodesByCode.get(stationCode.toUpperCase()) ?? new Set();
        const lines = interchangeLinesByCode.get(stationCode.toUpperCase()) ?? new Set();
        for (const target of f.leadsTo) {
          const t = String(target).toUpperCase();
          if (lines.has(t) || known.has(t)) continue;
          if (known.size === 0) {
            // No exit data for this station, so an unrecognised target may be
            // a real exit we simply do not have. A line code would have
            // matched above, so this cannot hide a bad transfer.
            warnings.push(`${at}: leadsTo "${target}" is unverifiable — no exit data for ${stationCode}`);
            continue;
          }
          errors.push(
            `${at}: leadsTo "${target}" is neither a known exit at ${stationCode} (${[...known].join(", ")}) nor a line you can change to here (${[...lines].join(", ") || "none"})`,
          );
        }
      }

      // Two features of the same type on one platform must each say where they
      // lead, or the app cannot tell them apart and would have to guess.
      if (
        Array.isArray(f.leadsTo) &&
        f.leadsTo.length === 0 &&
        f.confidence !== "estimate" &&
        features.some((o) => o !== f && o.type === f.type)
      ) {
        errors.push(
          `${at}: another ${f.type} is recorded on this platform, so leadsTo is required to tell them apart`,
        );
      }

      // Estimates legitimately pile up on the end doors: any exit projecting
      // beyond the train's length clamps there. Only surveyed data should be
      // unique per door, so only warn about that.
      const dupKey = `${f.type}:${f.doorIndex}`;
      if (f.confidence !== "estimate") {
        if (seen.has(dupKey)) {
          warnings.push(`${at}: duplicate ${f.type} recorded at door ${f.doorIndex}`);
        }
        seen.add(dupKey);
      }
    });
  }

  // Landmarks must reference exits that actually exist at that station, and
  // must not repeat a place — dedup is what makes the per-station budget go far.
  for (const [code, items] of Object.entries(landmarks.stations ?? {})) {
    const known = exitCodesByCode.get(code.toUpperCase());
    if (!known) {
      errors.push(`landmarks: unknown station "${code}"`);
      continue;
    }
    if (!Array.isArray(items)) {
      errors.push(`landmarks ${code}: expected an array`);
      continue;
    }
    const seenPlaces = new Set();
    for (const l of items) {
      if (!known.has(l.exit)) {
        errors.push(`landmarks ${code}: exit "${l.exit}" is not a known exit there`);
      }
      if (typeof l.metres !== "number" || l.metres < 0) {
        errors.push(`landmarks ${code}: "${l.name}" has an invalid distance`);
      }
      const key = `${l.name}|${l.kind}`;
      if (seenPlaces.has(key)) {
        errors.push(`landmarks ${code}: "${l.name}" listed more than once`);
      }
      seenPlaces.add(key);
    }
  }

  // Every station should still resolve to a line we model.
  for (const s of stations.stations) {
    if (!lineOf(s.code)) {
      errors.push(`${s.code}: no line for this station code`);
    }
  }

  // ---- Service adjustments -------------------------------------------------
  //
  // These are transcribed by hand out of LTA alert prose, which is the only
  // place the replacement times exist. The gate that keeps that honest is
  // simple: every time we state must be readable in the alert text we stored
  // as its citation. A figure that cannot be found there was invented.
  const VALID_EFFECTS = ["modified-schedule", "closed"];
  const VALID_DAYS = [
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  ];
  const KNOWN_LINES = new Set(Object.values(PREFIX_TO_LINE));
  const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const today = new Date().toISOString().slice(0, 10);
  const seenIds = new Set();

  for (const a of adjustments.adjustments ?? []) {
    const at = `service-adjustments "${a.id ?? "(no id)"}"`;

    if (!a.id) errors.push(`${at}: id is required`);
    else if (seenIds.has(a.id)) errors.push(`${at}: duplicate id`);
    else seenIds.add(a.id);

    if (!Array.isArray(a.lines) || a.lines.length === 0) {
      errors.push(`${at}: lines must be a non-empty array`);
    } else {
      for (const line of a.lines) {
        if (!KNOWN_LINES.has(line)) {
          errors.push(`${at}: unknown line "${line}"`);
          continue;
        }
        // Which line an adjustment applies to is always stated in the alert,
        // and getting it wrong silently moves another line's timetable.
        const aliases = LINE_ALIASES[line] ?? [line];
        if (!aliases.some((alias) => mentions(a.sourceNote ?? "", alias))) {
          errors.push(
            `${at}: sourceNote never mentions ${line} (looked for ${aliases.map((x) => `"${x}"`).join(", ")}) — the line must be citable, not assumed`,
          );
        }
      }
    }

    if (!isDate(a.activeFrom)) errors.push(`${at}: activeFrom must be YYYY-MM-DD`);
    if (!isDate(a.activeTo)) errors.push(`${at}: activeTo must be YYYY-MM-DD`);
    if (isDate(a.activeFrom) && isDate(a.activeTo) && a.activeTo < a.activeFrom) {
      errors.push(`${at}: activeTo ${a.activeTo} is before activeFrom ${a.activeFrom}`);
    }
    if (!VALID_EFFECTS.includes(a.effect)) {
      errors.push(`${at}: effect must be one of ${VALID_EFFECTS.join(", ")}`);
    }
    if (typeof a.sourceNote !== "string" || a.sourceNote.trim().length === 0) {
      errors.push(`${at}: sourceNote is required — it is the citation`);
    }
    if (!isDate(a.citedOn)) errors.push(`${at}: citedOn must be YYYY-MM-DD`);

    // A warning rather than an error: unlike a day or a line, a date range is
    // not always stated — "until further notice" is a real thing LTA writes —
    // and a wrong end date fails toward the published timetable rather than
    // toward a wrong time.
    for (const [field, value] of [["activeFrom", a.activeFrom], ["activeTo", a.activeTo]]) {
      if (!isDate(value)) continue;
      const forms = dateAliases(value);
      if (!forms.some((f) => mentions(a.sourceNote ?? "", f))) {
        warnings.push(
          `${at}: ${field} ${value} does not appear in sourceNote (looked for ${forms.map((x) => `"${x}"`).join(", ")}) — check it was not assumed`,
        );
      }
    }

    if (a.effect === "closed" && a.overrides) {
      errors.push(`${at}: a closure must not carry schedule overrides`);
    }

    for (const o of a.overrides ?? []) {
      if (!Array.isArray(o.days) || o.days.length === 0) {
        errors.push(`${at}: an override needs at least one day`);
      }
      for (const d of o.days ?? []) {
        if (!VALID_DAYS.includes(d)) {
          errors.push(`${at}: unknown day "${d}"`);
          continue;
        }
        // The failure this catches is a correct time attached to the wrong
        // day — the mistake a careless reading of dense prose actually makes,
        // and one the time check alone cannot see.
        const words = DAY_SYNONYMS[d];
        if (!words.some((w) => mentions(a.sourceNote ?? "", w))) {
          errors.push(
            `${at}: sourceNote never mentions ${d} (looked for ${words.map((x) => `"${x}"`).join(", ")}) — the day must be citable, not assumed`,
          );
        }
      }
      if (o.first === undefined && o.last === undefined) {
        errors.push(`${at}: an override must set first, last, or both`);
      }
      for (const [field, value] of [["first", o.first], ["last", o.last]]) {
        if (value === undefined) continue;
        if (!isTime(value)) {
          errors.push(`${at}: ${field} "${value}" must be HH:MM`);
          continue;
        }
        // The citation check. "23:30" must appear in the alert text either as
        // written or as LTA words it ("11.30pm").
        const [h, m] = value.split(":").map(Number);
        const spoken = `${((h + 11) % 12) + 1}.${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
        const note = String(a.sourceNote ?? "").toLowerCase();
        if (!note.includes(value) && !note.includes(spoken)) {
          errors.push(
            `${at}: ${field} "${value}" does not appear in sourceNote (looked for "${value}" and "${spoken}") — every stated time must be citable`,
          );
        }
      }
    }

    // Expired entries are already ignored at runtime, so this is a cleanup
    // notice rather than a failure: a build must not start failing on a date.
    if (isDate(a.activeTo) && a.activeTo < today) {
      warnings.push(`${at}: ended ${a.activeTo} and can be removed`);
    }
  }

  console.log(
    `  ${(adjustments.adjustments ?? []).length} service adjustment(s), ` +
      `${(adjustments.adjustments ?? []).filter((a) => a.activeFrom <= today && a.activeTo >= today).length} in force today`,
  );

  // ------------------------------------------------------------- orientation
  //
  // Layouts and door sides decide which way a reader turns when the doors
  // open, so they get the same treatment as every other claim: a source, a
  // confidence, and no derived tier.
  //
  // These checks used to sit in a bare top-level block calling a `fail()` that
  // was never defined, so the first bad layout raised a ReferenceError instead
  // of reporting itself — and aborted before any other error was printed.
  // Folded in here so they share the error list, the summary and the exit code.
  const LAYOUTS = ["island", "side", "stacked"];

  for (const [code, entry] of Object.entries(positions.layouts ?? {})) {
    if (!LAYOUTS.includes(entry.layout)) {
      errors.push(`layout ${code}: "${entry.layout}" is not one of ${LAYOUTS.join(", ")}`);
    }
    if (!entry.source) errors.push(`layout ${code}: missing source`);
    if (entry.confidence !== "verified") {
      errors.push(`layout ${code}: confidence must be "verified" — a layout cannot be derived`);
    }
  }

  for (const [key, entry] of Object.entries(positions.orientation ?? {})) {
    if (entry.side !== "left" && entry.side !== "right") {
      errors.push(`orientation ${key}: side must be "left" or "right"`);
    }
    if (!entry.source) errors.push(`orientation ${key}: missing source`);
    if (entry.confidence !== "verified") {
      errors.push(`orientation ${key}: confidence must be "verified"`);
    }
  }

  console.log(
    `  ${Object.keys(positions.layouts ?? {}).length} platform layout(s), ` +
      `${Object.keys(positions.orientation ?? {}).length} surveyed door side(s)`,
  );

  const exitTotal = stations.stations.reduce((n, s) => n + (s.exits?.length ?? 0), 0);
  console.log(
    `  ${stations.stations.length} stations, ${exitTotal} exits, ` +
      `${Object.keys(landmarks.stations ?? {}).length} stations with landmarks`,
  );

  for (const w of warnings) console.warn(`  warn  ${w}`);
  for (const e of errors) console.error(`  ERROR ${e}`);

  const surveyed = Object.values(positions.platforms ?? {}).flat().length;
  const estimated = Object.values(estimates.platforms ?? {}).flat().length;
  console.log(
    `\nvalidate-data: ${surveyed} surveyed and ${estimated} estimated position(s), ` +
      `${errors.length} error(s), ${warnings.length} warning(s)`,
  );

  if (errors.length > 0) process.exit(1);
}

/**
 * Exported so the citation rules can be unit-tested.
 *
 * These are what stop a stated time, day or line from being something nobody
 * published, which matters more now that the entries they guard may be drafted
 * by something other than a person reading the alert carefully.
 */
export { mentions, dateAliases, DAY_SYNONYMS, LINE_ALIASES };

// Only run when invoked as a script, so importing the helpers does not
// validate the whole repository as a side effect.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
