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
import { fileURLToPath } from "node:url";
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
  const [positions, stations, exits, estimates, landmarks] = await Promise.all([
    read("src/data/positions.json"),
    read("src/data/stations.json"),
    read("src/data/exits.json"),
    read("src/data/estimates.json"),
    read("src/data/landmarks.json"),
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// --------------------------------------------------------------- orientation
//
// Layouts and door sides decide which way a reader turns when the doors open,
// so they get the same treatment as every other claim: a source, a confidence,
// and no derived tier.
{
  const positions = JSON.parse(
    await readFile(new URL("../src/data/positions.json", import.meta.url), "utf8"),
  );
  const LAYOUTS = ["island", "side", "stacked"];

  for (const [code, entry] of Object.entries(positions.layouts ?? {})) {
    if (!LAYOUTS.includes(entry.layout)) {
      fail(`layout ${code}: "${entry.layout}" is not one of ${LAYOUTS.join(", ")}`);
    }
    if (!entry.source) fail(`layout ${code}: missing source`);
    if (entry.confidence !== "verified") {
      fail(`layout ${code}: confidence must be "verified" — a layout cannot be derived`);
    }
  }

  for (const [key, entry] of Object.entries(positions.orientation ?? {})) {
    if (entry.side !== "left" && entry.side !== "right") {
      fail(`orientation ${key}: side must be "left" or "right"`);
    }
    if (!entry.source) fail(`orientation ${key}: missing source`);
    if (entry.confidence !== "verified") {
      fail(`orientation ${key}: confidence must be "verified"`);
    }
  }

  console.log(
    `  ${Object.keys(positions.layouts ?? {}).length} platform layout(s), ` +
      `${Object.keys(positions.orientation ?? {}).length} surveyed door side(s)`,
  );
}
