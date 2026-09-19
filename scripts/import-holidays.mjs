/**
 * Imports Singapore's public holidays.
 *
 * The timetable on a public holiday is the Sunday one, and until now the app
 * had no way to know a Monday was a holiday. That was tolerable while all
 * three timetables were on screen for the reader to pick from; once the page
 * started showing only today's, a public holiday would have shown the weekday
 * times — wrong on the eleven days a year it matters most.
 *
 * MOM publishes a consolidated dataset rather than one per year, so this is
 * worth re-running once a year rather than re-pointing at a new id:
 *   https://data.gov.sg/datasets/d_8ef23381f9417e4d4254ee8b4dcdb176/view
 *
 * Usage:
 *   npm run import:holidays
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATASET_ID = "d_8ef23381f9417e4d4254ee8b4dcdb176";
const SOURCE_URL = `https://data.gov.sg/datasets/${DATASET_ID}/view`;
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src", "data", "holidays.json");

/** One CSV row, tolerating quoted fields — holiday names contain commas. */
function splitRow(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const poll = await fetch(POLL_URL, { headers: { "User-Agent": "mrt-kiasu/1.0" } });
if (!poll.ok) {
  console.error(`poll-download failed: ${poll.status}`);
  process.exit(1);
}
const { data } = await poll.json();
if (!data?.url) {
  console.error(`no download url in the poll response: ${JSON.stringify(data)}`);
  process.exit(1);
}

const csv = await (await fetch(data.url)).text();
const [header, ...rows] = csv.trim().split(/\r?\n/);
const cols = splitRow(header);
const dateAt = cols.indexOf("date");
const nameAt = cols.indexOf("holiday");
if (dateAt < 0 || nameAt < 0) {
  console.error(`unexpected columns: ${cols.join(", ")}`);
  process.exit(1);
}

const dates = {};
for (const row of rows) {
  const cells = splitRow(row);
  const date = cells[dateAt];
  const name = cells[nameAt];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`skipping a row whose date is not a date: ${row}`);
    continue;
  }
  dates[date] = name;
}

const years = [...new Set(Object.keys(dates).map((d) => d.slice(0, 4)))].sort();
if (years.length === 0) {
  console.error("no holidays parsed — refusing to write an empty file");
  process.exit(1);
}

await writeFile(
  OUT,
  JSON.stringify(
    {
      _source: {
        dataset: "Singapore Public Holidays (consolidated)",
        agency: "Ministry of Manpower",
        datasetId: DATASET_ID,
        url: SOURCE_URL,
        retrieved: new Date().toISOString().slice(0, 10),
        note:
          "Gazetted public holidays. A holiday falling on a Sunday is listed " +
          "again as the Monday '(Observed)', which is the day the timetable " +
          "actually changes.",
      },
      years: { first: years[0], last: years.at(-1) },
      dates: Object.fromEntries(Object.entries(dates).sort(([a], [b]) => a.localeCompare(b))),
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `holidays: ${Object.keys(dates).length} date(s), ${years[0]}–${years.at(-1)} -> src/data/holidays.json`,
);
