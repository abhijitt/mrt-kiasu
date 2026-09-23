/**
 * Types and pure helpers for platform features.
 *
 * Deliberately separate from positions.ts, which imports the ~430 KB estimates
 * dataset. Client components need the types and the filtering rules but must
 * never pull the data — importing a single helper from a module that also
 * imports JSON drags the whole file into the browser bundle.
 */

/**
 * What a feature physically IS — never what it is for.
 *
 * There used to be a "transfer" member here, which conflated the device with
 * its destination. A surveyor standing at the escalator into the Circle Line
 * corridor had to choose between recording that it was an escalator and
 * recording where it led, and either choice lost something real: picking
 * "transfer" threw away the fact that a lift-preferring commuter should be
 * warned, and picking "escalator" left no way to say where it went.
 *
 * Where a feature leads is now `leadsTo` alone, carrying exit codes and line
 * codes side by side, so one escalator can serve both and a preference
 * survives a transfer.
 *
 * "exit" is the exception, and it is not a device: it is what an estimate can
 * honestly claim — where an exit surfaces, without knowing what serves it.
 */
export type FeatureType = "escalator" | "lift" | "stairs" | "exit";

/**
 * The types a commuter can express a preference between.
 *
 * "exit" is excluded because nobody prefers one: it is the fallback we show
 * when no device has been surveyed.
 */
export const DEVICE_TYPES = ["escalator", "lift", "stairs"] as const satisfies readonly FeatureType[];

export type SourceKind = "survey" | "osm" | "official-map" | "user" | "estimate";
export type Confidence = "verified" | "candidate" | "estimate";

/**
 * Which way an escalator runs.
 *
 * An escalator that only goes DOWN is worse than useless to someone getting
 * off a train, and sending them to one would be actively wrong. Stairs and
 * lifts serve both directions inherently, so this only applies to escalators.
 * "reversible" covers the ones that switch with the peak direction.
 */
export type Travel = "up" | "down" | "reversible";

export interface PlatformFeature {
  type: FeatureType;
  /**
   * The best door for THIS platform, which is not always the same as the other
   * platform's, even for one physical object.
   *
   * A lift on an island platform has a facing. At Paya Lebar its door opens
   * toward the Eunos-bound side, so someone alighting there steps almost into
   * it, while someone on the Aljunied-bound side has to walk around the shaft
   * and is better off a few doors along. One lift, two answers.
   */
  doorIndex: number;
  /**
   * Stable identity of the physical thing, where two platform records describe
   * the same one.
   *
   * Without it, "same feature" has to be guessed from type and doorIndex — and
   * that guess breaks on exactly the case it is needed for, because a staggered
   * lift has a different doorIndex on each side and reads as two lifts. A
   * commuter who is told a station has two lifts when it has one has been given
   * a worse answer than no answer.
   *
   * Optional: most features sit at the same door both ways and need no id.
   */
  id?: string;
  /**
   * Where this leads: exit codes as printed on station signage ("C"), line
   * codes for a transfer corridor ("CCL"), or both. One axis, so an escalator
   * that serves Exit C and the Circle Line says so in one row.
   */
  leadsTo: string[];
  source: SourceKind;
  confidence: Confidence;
  verifiedAt?: string;
  sourceNote: string;
  /** Escalators only: which way it runs. */
  travel?: Travel;
  /**
   * The targets in `leadsTo` this reaches, but not as well as something else
   * on the same platform does.
   *
   * Per target, not per feature, because "worse" is rarely a property of the
   * thing itself. At Bras Basah the escalator at one end of the platform is
   * the best way to Exits A and B and a longer way round to C, D and E; the
   * escalator at the other end is exactly the reverse. A flag on the feature
   * could only have said both were bad, or that neither was.
   *
   * Listing every target it reaches says the feature is never the best way to
   * anywhere — the far stairs at Paya Lebar, which do lead to Exits A and E
   * but send you the length of the platform to get there.
   *
   * Never a reason to hide anything: a demoted feature is still offered when
   * it is the only one that fits.
   */
  secondaryFor?: string[];
  /**
   * Set when nobody surveyed this platform: the record was inferred from the
   * other direction because the station is an island platform, where one
   * escalator stands between the two tracks and serves both faces.
   *
   * The inference is sound, but it is still an inference, and a record that
   * claimed to be a field survey when no one stood there would corrupt the one
   * thing this dataset promises. A real survey of this face always replaces it.
   */
  impliedFrom?: "asc" | "desc";
  /** Metres along the platform from its centre; estimates only. */
  offsetM?: number;
}

/**
 * Usable by someone alighting and heading for where this leads.
 *
 * This used to exclude every down-only escalator, on the assumption that a
 * commuter getting off a train always needs to go up. That assumption is
 * wrong twice over. At an elevated platform like Paya Lebar's East West Line,
 * down IS the way out — the dataset had to record those escalators as running
 * "up" to stop the app hiding them from the very people they serve. And at a
 * deep interchange like Bayfront, the exit is up and the Downtown Line is
 * down from the same platform, so no fact about the station could decide it.
 *
 * So the assumption is gone. Where a person stood on the platform and recorded
 * that an escalator leads somewhere, it leads there, whichever way its steps
 * move; `travel` is kept to tell a commuter what to expect, not to overrule
 * the surveyor. An estimate is a different matter — nobody checked it, and a
 * guessed down-only escalator is still worth excluding.
 */
export function servesAlighting(f: PlatformFeature): boolean {
  if (f.type !== "escalator") return true;
  if (f.travel !== "down") return true;
  return f.confidence === "verified" && f.leadsTo.length > 0;
}

/**
 * Whether two records describe the same physical thing.
 *
 * Identity first, because a staggered lift deliberately has a different
 * doorIndex on each platform and would otherwise read as two lifts. Falling
 * back to type and door is right for everything else: nothing else on a
 * platform is two of the same kind of device at one door.
 */
export function sameFeature(a: PlatformFeature, b: PlatformFeature): boolean {
  if (a.id && b.id) return a.id === b.id;
  if (a.id || b.id) return false;
  return a.type === b.type && a.doorIndex === b.doorIndex;
}

/**
 * Whether this is the long way round to where the reader is heading.
 *
 * With no target in mind the question is whether the feature is ever the best
 * way to anywhere: one that is second-best to some places and first to others
 * must not be demoted wholesale, or the Bras Basah escalator that is the
 * obvious choice for Exit A would lose to nothing in particular.
 */
export function isLongWayTo(f: PlatformFeature, target?: string | null): boolean {
  const demoted = f.secondaryFor ?? [];
  if (demoted.length === 0) return false;
  if (target) return demoted.some((t) => targetMatches(t, target));
  return f.leadsTo.every((t) =>
    demoted.some((d) => d.toUpperCase() === t.toUpperCase()),
  );
}

/**
 * A transfer that only reaches one direction of the next line.
 *
 * At Stevens the TEL platform has two ways down to the Downtown Line, and they
 * are not interchangeable: the DTL there is stacked, one level per direction,
 * so the down escalator reaches the Bukit Panjang platform and a different
 * escalator reaches the Expo one. "DTL" alone would send half the people
 * changing there to the wrong level. Written "DTL:desc", in the same terms as
 * a platform key, and read by {@link targetMatches}.
 */
export function transferTarget(line: string, direction: "asc" | "desc"): string {
  return `${line}:${direction}`;
}

/** "dtl:DESC" -> { code: "DTL", direction: "desc" }; "a" -> { code: "A" }. */
export function splitTarget(entry: string): { code: string; direction?: "asc" | "desc" } {
  const [code, dir] = entry.split(":");
  const direction = dir?.toLowerCase();
  return direction === "asc" || direction === "desc"
    ? { code: code.toUpperCase(), direction }
    : { code: code.toUpperCase() };
}

/**
 * Whether a recorded target answers the question being asked.
 *
 * Case-insensitive, and a side that names no direction covers both: a lift
 * recorded as reaching "DTL" reaches either platform, and someone who only
 * knows they are changing to the DTL is served by the Bukit Panjang escalator
 * as much as by any other. Only when BOTH name a direction can they disagree.
 */
export function targetMatches(entry: string, target: string): boolean {
  const a = splitTarget(entry);
  const b = splitTarget(target);
  if (a.code !== b.code) return false;
  return !a.direction || !b.direction || a.direction === b.direction;
}

/**
 * `target` is an exit code, a line code, or a line code with a direction —
 * "A", "DTL", "DTL:desc" — indifferently.
 */
export function leadsToTarget(f: PlatformFeature, target: string): boolean {
  return f.leadsTo.some((t) => targetMatches(t, target));
}

/**
 * Picks what to show for "get me to the thing I am heading for".
 *
 * `target` is an exit code on the last leg and the next leg's line code at an
 * interchange — the same lookup either way, because the data no longer draws a
 * distinction between an escalator that leads out and one that leads across.
 *
 * Honours the escalator/lift/stairs preference where a survey recorded one,
 * then any surveyed device, then the exit-position estimate. Callers can tell
 * which happened from the returned feature's `type` and `confidence`, and the
 * UI says so rather than implying the preference was applied.
 *
 * Within each of those tiers a feature the surveyor marked as the long way
 * round TO THIS TARGET loses to one they did not. It loses within its tier and
 * no further: someone who asked for a lift and can only reach a roundabout one
 * still gets the lift, because the preference is usually a need.
 */
export function chooseFeature(
  features: PlatformFeature[],
  preference: FeatureType,
  target?: string | null,
): PlatformFeature | null {
  const matches = (f: PlatformFeature) => !target || leadsToTarget(f, target);
  const usable = (f: PlatformFeature) => matches(f) && servesAlighting(f);
  const best = (fits: (f: PlatformFeature) => boolean) =>
    features.find((f) => fits(f) && !isLongWayTo(f, target)) ?? features.find(fits);

  return (
    best((f) => f.type === preference && usable(f)) ??
    best((f) => f.confidence !== "estimate" && usable(f)) ??
    features.find((f) => f.type === "exit" && matches(f)) ??
    null
  );
}
