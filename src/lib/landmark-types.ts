/**
 * Landmark type and pure helpers.
 *
 * Separate from landmarks.ts, which imports the ~740 KB dataset. Client
 * components need the shape and the grouping logic but must never pull the
 * data — importing one helper from a module that also imports JSON drags the
 * whole file into the browser bundle.
 */

export interface Landmark {
  name: string;
  /** Category key, translated in the UI. */
  kind: string;
  /** Exit code this landmark is nearest to. */
  exit: string;
  /** Straight-line metres from that exit, not a walking route. */
  metres: number;
  /** Street address, shown and searchable. */
  street?: string;
  /** Extra search terms: operator, alternative names, acronyms. */
  terms?: string;
}

/** Splits text into lowercase word tokens. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * How well a landmark matches a query, or null for no match.
 *
 * Every query token must prefix-match some token of the landmark, so "evans"
 * finds the club on Evans Road and "moe sports" narrows to it. Matching only
 * the display name — as the first version did — meant you had to already know
 * the official name, which defeats the point of searching.
 *
 * Lower scores rank first: name matches beat street matches, which beat
 * operator/acronym matches.
 */
export function matchScore(landmark: Landmark, query: string): number | null {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const nameTokens = tokenize(landmark.name);
  const streetTokens = tokenize(landmark.street ?? "");
  const termTokens = tokenize(landmark.terms ?? "");

  let score = 0;
  for (const token of tokens) {
    const inName = nameTokens.some((w) => w.startsWith(token));
    const inStreet = streetTokens.some((w) => w.startsWith(token));
    const inTerms = termTokens.some((w) => w.startsWith(token));
    if (!inName && !inStreet && !inTerms) return null;
    // Whole-name prefix ("juncti" for "Junction 8") is the strongest signal.
    score += inName ? 0 : inStreet ? 1 : 2;
  }
  return score;
}

/** Landmarks matching a query, best match first then nearest. */
export function searchLandmarks(landmarks: Landmark[], query: string): Landmark[] {
  if (!query.trim()) return [];
  return landmarks
    .map((l) => ({ l, score: matchScore(l, query) }))
    .filter((x): x is { l: Landmark; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.l.metres - b.l.metres)
    .map((x) => x.l);
}

/** Groups landmarks by the exit they serve, nearest first within each. */
export function groupByExit(landmarks: Landmark[]): Record<string, Landmark[]> {
  const out: Record<string, Landmark[]> = {};
  for (const l of landmarks) {
    (out[l.exit] ??= []).push(l);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.metres - b.metres);
  return out;
}
