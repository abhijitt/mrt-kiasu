/**
 * Guards against datasets leaking into the browser bundle.
 *
 * The data files total roughly 1 MB. They belong on the server: importing a
 * single helper from a module that also imports JSON drags the whole file into
 * the client, which is easy to do by accident and invisible until someone
 * loads the app on mobile data.
 *
 * Run after `next build`. Needles are strings that appear ONLY in the dataset,
 * never in source — so a hit means the data itself was bundled.
 *
 * Usage: node scripts/check-bundle.mjs
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const CHUNKS = ".next/static/chunks";

const NEEDLES = [
  { name: "trivia.json", needle: "Mass Rapid Transit interchange station" },
  { name: "landmarks.json", needle: "Junction 8" },
  { name: "estimates.json", needle: "along the line bearing from" },
  // Chinese station names exist only in stations.json.
  { name: "stations.json", needle: "武吉巴督" },
  // Translated prose exists only in trivia.translated.json.
  { name: "trivia.translated.json", needle: "地铁转换站" },
];

async function jsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await jsFiles(path)));
    else if (e.name.endsWith(".js")) out.push(path);
  }
  return out;
}

const files = await jsFiles(CHUNKS);
if (files.length === 0) {
  console.error(`No client chunks under ${CHUNKS} — run "next build" first.`);
  process.exit(1);
}

const contents = await Promise.all(
  files.map(async (f) => [f, await readFile(f, "utf8")]),
);

let failed = false;
for (const { name, needle } of NEEDLES) {
  const hits = contents.filter(([, text]) => text.includes(needle)).map(([f]) => f);
  if (hits.length > 0) {
    failed = true;
    console.error(`  FAIL ${name} is in the client bundle:`);
    for (const h of hits.slice(0, 3)) console.error(`         ${h}`);
  } else {
    console.log(`  ok   ${name} stays server-side`);
  }
}

console.log(`\ncheck-bundle: scanned ${files.length} chunks`);
if (failed) {
  console.error(
    "\nA client component is importing a module that imports one of these\n" +
      "datasets. Import types and pure helpers from src/lib/feature-types.ts,\n" +
      "or compute the value on the server and pass it as a prop.",
  );
  process.exit(1);
}
