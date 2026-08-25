import transfersData from "@/data/transfers.json";

/**
 * How long it takes to change platforms at an interchange.
 *
 * There is no published source for this. LTA's GTFS feed omits the standard
 * transfers.txt that would carry min_transfer_time, and no dataset gives
 * platform-to-platform walking times.
 *
 * So the app uses ONE assumed figure rather than forty invented ones. A
 * per-station guess would look like data without being any — and this app's
 * whole claim is that you can tell the difference. Measured values can be
 * added to `overrides` one at a time, and each carries its own source.
 */

export type TransferConfidence = "assumed" | "measured";

export interface TransferTime {
  minutes: number;
  confidence: TransferConfidence;
  /** Present on measured values: who timed it and when. */
  sourceNote?: string;
}

const DEFAULT = transfersData.default as TransferTime;
const OVERRIDES = transfersData.overrides as Record<string, TransferTime>;

/** Order-independent, since a transfer takes the same time either way. */
function keyFor(a: string, b: string): string {
  const [x, y] = [a.toUpperCase(), b.toUpperCase()].sort();
  return `${x}|${y}`;
}

export function transferTime(fromCode: string, toCode: string): TransferTime {
  return OVERRIDES[keyFor(fromCode, toCode)] ?? DEFAULT;
}

/** True when this figure is a measurement rather than the blanket assumption. */
export function isMeasured(t: TransferTime): boolean {
  return t.confidence === "measured";
}

export const TRANSFER_SOURCE = transfersData._source;
