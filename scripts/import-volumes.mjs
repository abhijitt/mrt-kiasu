/**
 * Imports how many people tap in and out at each station.
 *
 * LTA publishes a month of farecard totals per station, split by weekday and
 * weekend/holiday and by hour of the day:
 *   https://datamall2.mytransport.sg/ltaodataservice/PV/Train
 *
 * Two things have to be done to it before it means anything.
 *
 * The figures are MONTHLY TOTALS, not daily. Aljunied reads 468,684, which is
 * a month of weekdays. Turning that into a daily average needs the number of
 * weekdays in the month with the public holidays taken out, which is what
 * src/data/holidays.json is for — LTA's "WEEKENDS/HOLIDAY" means exactly what
 * MOM gazettes, so the two datasets agree by construction. August 2026 is 20
 * weekdays and 11 weekend/holiday days rather than 21 and 10, because National
 * Day fell on the Sunday and the Monday was gazetted in lieu.
 *
 * And an interchange is ONE row under a joined code: Dhoby Ghaut is
 * "NS24/NE6/CC1", Paya Lebar "EW8/CC9". A tap happens at a station, not at a
 * platform, so the figure is split back out to every code that names it and
 * each of them reports the same number — which is the truth.
 *
 * Usage:
 *   npm run import:volumes
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnvLocal } from "./load-env.mjs";

loadEnvLocal();

const KEY = process.env.LTA_ACCOUNT_KEY;
if (!KEY) {
  console.error("LTA_ACCOUNT_KEY is not set. Put it in .env.local.");
  process.exit(1);
}

const ENDPOINT = "https://datamall2.mytransport.sg/ltaodataservice/PV/Train";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src", "data", "volumes.json");
const HOLIDAYS = join(root, "src", "data", "holidays.json");
const STATIONS = join(root, "src", "data", "stations.json");

const res = await fetch(ENDPOINT, { headers: { AccountKey: KEY, accept: "application/json" } });
if (!res.ok) {
  console.error(`DataMall responded ${res.status}`);
  process.exit(1);
}
const { value } = await res.json();
if (!value?.[0]?.Link) {
  console.error("no download link in the response");
  process.exit(1);
}

const dir = await mkdtemp(join(tmpdir(), "pv-"));
let rows;
try {
  const zip = join(dir, "pv.zip");
  await writeFile(zip, Buffer.from(await (await fetch(value[0].Link)).arrayBuffer()));
  execFileSync("unzip", ["-q", "-o", zip, "-d", dir]);
  const csv = (await readdir(dir)).find((f) => f.endsWith(".csv"));
  if (!csv) {
    console.error("no CSV in the archive");
    process.exit(1);
  }
  rows = readFileSync(join(dir, csv), "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [month, dayType, , , code, tapIn, tapOut] = line.split(",");
      return { month, dayType, code, tapIn: Number(tapIn), tapOut: Number(tapOut) };
    })
    .filter((r) => r.code && Number.isFinite(r.tapIn) && Number.isFinite(r.tapOut));
} finally {
  await rm(dir, { recursive: true, force: true });
}

if (rows.length === 0) {
  console.error("no usable rows — refusing to write an empty file");
  process.exit(1);
}

const month = rows[0].month;
if (!/^\d{4}-\d{2}$/.test(month)) {
  console.error(`unexpected YEAR_MONTH: ${month}`);
  process.exit(1);
}

/** Days of each kind in that month, with MOM's holidays taken out. */
const holidays = JSON.parse(readFileSync(HOLIDAYS, "utf8")).dates;
const [year, mon] = month.split("-").map(Number);
const inMonth = new Date(year, mon, 0).getDate();
let weekdays = 0;
let weekends = 0;
const holidayNames = [];
for (let d = 1; d <= inMonth; d++) {
  const iso = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // UTC midnight, so the weekday is the calendar's rather than the runner's.
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const holiday = holidays[iso];
  if (holiday) holidayNames.push(`${iso} ${holiday}`);
  if (dow === 0 || dow === 6 || holiday) weekends++;
  else weekdays++;
}
if (weekdays === 0 || weekends === 0) {
  console.error(`implausible calendar for ${month}: ${weekdays} weekdays, ${weekends} weekends`);
  process.exit(1);
}

const DAY_KEY = { WEEKDAY: "weekday", "WEEKENDS/HOLIDAY": "weekend" };
const divisor = { weekday: weekdays, weekend: weekends };

/** code -> { weekday: {in,out}, weekend: {in,out} }, summed over the hours. */
const totals = {};
let unknownDayTypes = new Set();
for (const r of rows) {
  const key = DAY_KEY[r.dayType];
  if (!key) {
    unknownDayTypes.add(r.dayType);
    continue;
  }
  // One row per physical station; every code naming it gets the same figure.
  for (const code of r.code.split("/")) {
    const at = (totals[code] ??= {
      weekday: { in: 0, out: 0 },
      weekend: { in: 0, out: 0 },
    });
    at[key].in += r.tapIn;
    at[key].out += r.tapOut;
  }
}
if (unknownDayTypes.size > 0) {
  console.error(`unrecognised DAY_TYPE values, skipped: ${[...unknownDayTypes].join(", ")}`);
}

const stationList = (() => {
  const raw = JSON.parse(readFileSync(STATIONS, "utf8"));
  return Array.isArray(raw) ? raw : raw.stations;
})();

const stations = {};
const missing = [];
for (const station of stationList) {
  const at = totals[station.code];
  if (!at) {
    missing.push(station.code);
    continue;
  }
  stations[station.code] = {
    weekday: {
      in: Math.round(at.weekday.in / divisor.weekday),
      out: Math.round(at.weekday.out / divisor.weekday),
    },
    weekend: {
      in: Math.round(at.weekend.in / divisor.weekend),
      out: Math.round(at.weekend.out / divisor.weekend),
    },
  };
}

await writeFile(
  OUT,
  JSON.stringify(
    {
      _source: {
        dataset: "Passenger Volume by Train Stations",
        agency: "Land Transport Authority",
        endpoint: ENDPOINT,
        month,
        retrieved: new Date().toISOString().slice(0, 10),
        derivation:
          "LTA publishes monthly totals per station, by day type and hour. " +
          "Summed over the hours, then divided by the number of days of that " +
          `type in ${month} — ${weekdays} weekdays and ${weekends} ` +
          "weekends/holidays, with MOM's gazetted holidays counted as the " +
          "latter, which is how LTA groups them. An interchange is published " +
          "once under a joined code such as EW8/CC9, since a tap happens at a " +
          "station rather than a platform; every code naming that station " +
          "carries the same figure.",
        caveat:
          "Taps, not people: a return trip is two taps at two stations. The " +
          "freshest month LTA has published, so it lags by several weeks.",
        holidaysInMonth: holidayNames,
      },
      days: { weekday: weekdays, weekend: weekends },
      stations,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `volumes: ${Object.keys(stations).length} of ${stationList.length} stations for ${month} ` +
    `(${weekdays} weekdays, ${weekends} weekends/holidays) -> src/data/volumes.json`,
);
if (missing.length > 0) console.log(`  no figure for: ${missing.join(", ")}`);
