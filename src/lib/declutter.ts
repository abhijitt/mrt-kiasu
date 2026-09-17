/**
 * Pushing marks apart so a row of them stays readable.
 *
 * Both diagrams draw several things along one horizontal line, and both hit
 * the same failure: an escalator and the stairs on the same landing sit at the
 * same door, so they were drawn at the same point, and a door is narrower than
 * the thing drawn at it, so even neighbours collide. Two dark marks a pixel
 * apart read as one mark, which is worse than an obvious overlap because it
 * looks deliberate.
 */

/**
 * Positions for a row of marks, in the order the centres were given.
 *
 * Anything close enough to touch is grouped and fanned about the middle of its
 * own group, so a landing still points at where it actually is. A left-to-
 * right pass then enforces the spacing outright — the fan alone leaves gaps
 * between groups that a wide group can still reach into — and a row that runs
 * past the right-hand end is slid back rather than left hanging off the edge.
 *
 * `pitch` is centre-to-centre, so pass the widest mark plus the gap you want
 * between two of them.
 */
export function spreadOut(centres: number[], pitch: number, lo: number, hi: number): number[] {
  const order = centres.map((x, i) => ({ i, x })).sort((a, b) => a.x - b.x);

  const groups: (typeof order)[] = [];
  for (const m of order) {
    const last = groups.at(-1);
    if (last && m.x - last.at(-1)!.x < pitch) last.push(m);
    else groups.push([m]);
  }
  for (const g of groups) {
    const middle = g.reduce((sum, m) => sum + m.x, 0) / g.length;
    g.forEach((m, k) => {
      m.x = middle + (k - (g.length - 1) / 2) * pitch;
    });
  }

  let prev = -Infinity;
  for (const m of order) {
    m.x = Math.max(m.x, prev + pitch, lo);
    prev = m.x;
  }
  const over = prev - hi;
  if (over > 0) for (const m of order) m.x = Math.max(m.x - over, lo);

  const out = new Array<number>(centres.length);
  for (const m of order) out[m.i] = m.x;
  return out;
}

/**
 * The targets of one landing, short enough to sit over a door.
 *
 * A lift at an interchange reaches everything — seven targets at Paya Lebar —
 * and "A/B/C/D/E/F/CCL" is fifteen characters against a door eighteen units
 * wide, which is how the diagram came to read "A/BDC/D/E/F.EXCL/DZCCL". The
 * full list is written out under the station plan; over a door it only has to
 * say roughly where this goes.
 */
export function shortTargets(targets: string[], keep = 2): string {
  const seen = [...new Set(targets)];
  if (seen.length <= keep + 1) return seen.join("/");
  return `${seen.slice(0, keep).join("/")}+${seen.length - keep}`;
}
