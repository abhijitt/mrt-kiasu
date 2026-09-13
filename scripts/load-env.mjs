/**
 * Reads .env.local for the scripts, the way `next dev` already does for the app.
 *
 * Next loads that file; a plain node script does not, so every importer and
 * migration needed its secret pasted onto the command line. That is friction
 * at best — and at worst it puts a database password into shell history, and
 * into whatever terminal transcript happens to be running.
 *
 * Silent when the file is absent, so CI and one-off runs with the variable
 * already exported behave exactly as before. Values already in the environment
 * win: `DATABASE_URL='...' npm run migrate:db` still overrides the file, which
 * is how you point a script at a different branch for one run.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");

export function loadEnvLocal() {
  if (!existsSync(file)) return;
  const before = { ...process.env };
  try {
    process.loadEnvFile(file);
  } catch {
    // A malformed .env.local should not stop a script that may not need it.
    return;
  }
  // loadEnvFile overwrites; put back anything the caller set explicitly.
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value;
  }
}
