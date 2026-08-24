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

/**
 * Where client JavaScript can end up, in the order we prefer to report it.
 *
 * Vercel's Next 16 adapter ("Applying modifyConfig from Vercel") emits into
 * .vercel/output rather than leaving everything under .next, so hardcoding the
 * local path made this guard fail the deploy with "no client chunks" — it was
 * looking in a directory that only exists on a developer's machine.
 *
 * Whole `static` trees rather than just `static/chunks`: a dataset inlined into
 * any client-served JavaScript is the bug we care about, wherever it lands.
 */
const ROOTS = [".next/static", ".vercel/output/static"];

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

const found = [];
for (const root of ROOTS) {
  const files = await jsFiles(root);
  if (files.length > 0) found.push({ root, files });
}

if (found.length === 0) {
  console.error(
    `No client JavaScript found under any of: ${ROOTS.join(", ")}\n` +
      'Run "next build" first. If the build did run, the output location has\n' +
      "moved again and ROOTS in this script needs updating — do not treat this\n" +
      "as passing, because it means nothing was actually checked.",
  );
  process.exit(1);
}

const files = found.flatMap((f) => f.files);

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

console.log(
  `\ncheck-bundle: scanned ${files.length} files in ` +
    found.map((f) => `${f.root} (${f.files.length})`).join(", "),
);
if (failed) {
  console.error(
    "\nA client component is importing a module that imports one of these\n" +
      "datasets. Import types and pure helpers from src/lib/feature-types.ts,\n" +
      "or compute the value on the server and pass it as a prop.",
  );
  process.exit(1);
}
