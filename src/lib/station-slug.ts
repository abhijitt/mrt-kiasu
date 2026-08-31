/**
 * Station names in URLs.
 *
 * A route URL is built from station names, and names have spaces, so the
 * address bar filled up with %20: /route/Bencoolen/Paya%20Lebar. That is ugly
 * to read, worse to paste into a chat, and gets mangled by anything that
 * re-encodes a link. Slugs are lowercase with single hyphens instead.
 *
 * Checked against the whole network before adopting: of 181 distinct station
 * names, exactly one carries a character outside [A-Za-z0-9 ] — one-north,
 * which already has the hyphen — and no two names slug to the same string.
 *
 * Deliberately free of data imports, so the client components that build these
 * links can use it without dragging stations.json into the browser bundle.
 */

/** "Paya Lebar" -> "paya-lebar". Stable, lowercase, safe unencoded in a path. */
export function stationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * True when a URL segment already names this station in canonical form.
 *
 * Used to decide whether to redirect: an old link carrying "Paya%20Lebar" or
 * "PAYA LEBAR" still resolves, and then moves to the canonical address so the
 * page has one URL rather than several.
 */
export function isCanonicalSlug(segment: string, name: string): boolean {
  return segment === stationSlug(name);
}
