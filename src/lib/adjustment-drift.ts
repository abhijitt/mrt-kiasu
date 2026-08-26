/**
 * Watches for our hand-transcribed adjustments drifting from LTA's.
 *
 * src/data/service-adjustments.json is maintained by hand, because the
 * replacement times exist only in the prose of an alert. That is the honest
 * way to get the numbers right and the obvious way to end up quietly wrong:
 * LTA extends a closure, changes a time, or publishes something new, and our
 * file says what it said last month.
 *
 * So this compares the two and reports the difference. It never edits
 * anything — a change to published times is a decision for a person, made
 * against the alert text, exactly as the original entry was.
 *
 * Pure: takes the alerts, the adjustments and the date, and returns findings.
 */

import type { ServiceAdjustment } from "./service-adjustments";
import { isInForce } from "./service-adjustments";

export interface AlertMessage {
  Content: string;
  CreatedDate: string;
}

/**
 * Alerts we expect to find transcribed in the data file.
 *
 * Both current entries say "Planned Service Adjustment". A schedule change
 * worded some other way would not match, which is why `allAlerts` carries the
 * full text through to the report: the automated half flags what it is sure
 * about, and a person reads the rest.
 */
const PLANNED = /planned service adjustment/i;

export interface Drift {
  /** Reads like a planned adjustment, but nothing in our file cites it. */
  unrecorded: AlertMessage[];
  /** In force according to us, but LTA is no longer publishing the alert. */
  vanished: ServiceAdjustment[];
  /** Past its activeTo. Already ignored at runtime; should be deleted. */
  expired: ServiceAdjustment[];
  /** Everything LTA is currently saying, so a person can check the rest. */
  allAlerts: AlertMessage[];
}

/** True when nothing needs a human. */
export function isClean(drift: Drift): boolean {
  return (
    drift.unrecorded.length === 0 &&
    drift.vanished.length === 0 &&
    drift.expired.length === 0
  );
}

/**
 * Compares LTA's live alerts against what we have recorded.
 *
 * Matching is on the alert text we stored as the citation. That is strict —
 * LTA re-punctuating a sentence would read as both a vanished entry and an
 * unrecorded alert. That is the failure direction to prefer: a spurious flag
 * costs someone a glance, a missed one leaves a wrong last train on the site.
 */
export function findDrift(
  alerts: AlertMessage[],
  adjustments: ServiceAdjustment[],
  date: Date,
): Drift {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const live = alerts.map((a) => norm(a.Content));

  const expired = adjustments.filter((a) => date > new Date(`${a.activeTo}T23:59:59`));
  const inForce = adjustments.filter((a) => isInForce(a, date));

  const vanished = inForce.filter((a) => !live.includes(norm(a.sourceNote)));

  const recorded = new Set(adjustments.map((a) => norm(a.sourceNote)));
  const unrecorded = alerts.filter(
    (a) => PLANNED.test(a.Content) && !recorded.has(norm(a.Content)),
  );

  return { unrecorded, vanished, expired, allAlerts: alerts };
}

/** A short human-readable summary, for a report row or a terminal. */
export function describeDrift(drift: Drift): string {
  if (isClean(drift)) {
    return `No drift. ${drift.allAlerts.length} live alert(s), all accounted for.`;
  }
  const parts: string[] = [];
  for (const a of drift.unrecorded) {
    parts.push(`UNRECORDED planned adjustment (LTA ${a.CreatedDate}): ${a.Content}`);
  }
  for (const a of drift.vanished) {
    parts.push(
      `VANISHED: "${a.id}" is in force in our data until ${a.activeTo}, but LTA is no longer publishing its alert. Check whether it ended early.`,
    );
  }
  for (const a of drift.expired) {
    parts.push(`EXPIRED: "${a.id}" ended ${a.activeTo} and should be removed.`);
  }
  return parts.join("\n\n");
}
