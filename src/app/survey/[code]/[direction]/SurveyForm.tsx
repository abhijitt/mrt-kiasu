"use client";

import { useState } from "react";
import { PlatformDiagram } from "@/components/PlatformDiagram";
import { toCarPosition, type Direction } from "@/lib/doors";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import { useSettings } from "@/lib/settings";
import type { LineCode } from "@/lib/lines";
import { DEVICE_TYPES, type FeatureType, type PlatformFeature, type Travel } from "@/lib/feature-types";

// Devices only. Where a feature leads is step 3's job, and one escalator can
// serve an exit and a transfer corridor at once.
const TYPES: readonly FeatureType[] = DEVICE_TYPES;
const TRAVELS: Travel[] = ["up", "reversible", "down"];
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

interface Props {
  stationCode: string;
  stationName: string;
  line: LineCode;
  direction: Direction;
  totalDoors: number;
  exitCodes: string[];
  interchanges: string[];
  existing: PlatformFeature[];
  towards: string;
  /** Which side the doors open here, where we know — it orients the diagram. */
  doorSide?: "left" | "right";
}

/** One numbered step of the survey, so the flow reads as a sequence. */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pixel-box anim-enter p-4">
      <div className="flex items-center gap-3">
        <span className="font-pixel flex h-7 w-7 shrink-0 items-center justify-center border-2 border-[var(--border)] bg-accent text-[10px] text-[var(--accent-fg)]">
          {n}
        </span>
        <h2 className="font-pixel text-xs uppercase text-fg">{title}</h2>
      </div>
      {hint && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Choice({
  active,
  demoted = false,
  onClick,
  children,
}: {
  active: boolean;
  /** Reached, but the long way round. Drawn as an outline, not a fill. */
  demoted?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="pixel-btn font-pixel px-2 py-3 text-[10px] uppercase leading-tight"
      style={
        demoted
          ? { borderColor: "var(--accent)", color: "var(--accent)" }
          : active
            ? { background: "var(--accent)", color: "var(--accent-fg)" }
            : undefined
      }
    >
      {children}
    </button>
  );
}

export function SurveyForm({
  stationCode,
  stationName,
  line,
  direction,
  totalDoors,
  exitCodes,
  interchanges,
  existing,
  towards,
  doorSide,
}: Props) {
  const { t, locale } = useI18n();
  const { settings } = useSettings();
  const [doorIndex, setDoorIndex] = useState<number | null>(null);
  // Several, because one landing usually holds several: the escalator and the
  // stairs beside it are one walk from the train, and asking for two round
  // trips through this form is how a surveyor gives up half way down a
  // platform — or gets rate-limited off it.
  const [types, setTypes] = useState<FeatureType[]>(["escalator"]);
  const [travel, setTravel] = useState<Travel>("up");
  const [leadsTo, setLeadsTo] = useState<string[]>([]);
  // Targets this reaches the long way round. A subset of leadsTo, because one
  // escalator is routinely the obvious choice for one end of a station and a
  // trek to the other.
  const [secondaryFor, setSecondaryFor] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [payload, setPayload] = useState<string | null>(null);

  const position = doorIndex != null ? toCarPosition(doorIndex, line, direction) : null;

  // Where it leads is only optional while it is unambiguous. Once a second
  // escalator goes in, an untagged pair is worse than one good row: the app
  // would have to pick between them, and picking is guessing. With several
  // kinds selected the strictest one wins, since they share the one answer.
  const clashing = types.filter((id) => existing.some((f) => f.type === id));
  const targetRequired = clashing.length > 0;
  const needsTarget = targetRequired && leadsTo.length === 0;
  const typeLabel = clashing
    .map((id) => t(`mode.${id}.target` as MessageKey))
    .join(t("survey.andJoin"));
  // "Which way does it run?" only applies to escalators, so every step after
  // it shifts up by one. Derived once: numbering it twice by hand is how the
  // last two steps both came to be labelled 4.
  const hasTravelStep = types.includes("escalator");
  const ready = doorIndex != null && types.length > 0 && !needsTarget;

  // Deselecting the last one would leave the survey describing nothing, so the
  // final selection holds until another is picked.
  function toggleType(id: FeatureType) {
    setTypes((prev) => {
      if (!prev.includes(id)) return [...TYPES].filter((x) => prev.includes(x) || x === id);
      return prev.length === 1 ? prev : prev.filter((x) => x !== id);
    });
    setLeadsTo([]);
    setSecondaryFor([]);
  }

  /**
   * Three states, cycled by tapping: not here, the best way here, the long way
   * round. A separate control for the third state would have had to apply to
   * the whole feature, which is the one thing this cannot mean — the escalator
   * that is best for Exit A is often the trek to Exit D.
   */
  function toggleTarget(target: string) {
    const listed = leadsTo.includes(target);
    const demoted = secondaryFor.includes(target);
    if (!listed) {
      setLeadsTo([...leadsTo, target]);
    } else if (!demoted) {
      setSecondaryFor([...secondaryFor, target]);
    } else {
      setLeadsTo(leadsTo.filter((x) => x !== target));
      setSecondaryFor(secondaryFor.filter((x) => x !== target));
    }
  }

  function nudge(delta: number) {
    setDoorIndex((prev) => {
      const next = (prev ?? 1) + delta;
      return Math.min(totalDoors, Math.max(1, next));
    });
  }

  function describeDoor(idx: number): string {
    const pos = toCarPosition(idx, line, direction);
    return `${t("route.car", { car: pos.car, total: pos.totalCars })} · ${t("route.door", {
      ordinal: ORDINALS[pos.doorInCar - 1] ?? pos.doorInCar,
    })}`;
  }

  async function save() {
    if (doorIndex == null || needsTarget) return;

    const verifiedAt = new Date().toISOString().slice(0, 10);
    const features: PlatformFeature[] = types.map((id) => ({
      type: id,
      doorIndex,
      leadsTo,
      source: "survey",
      confidence: "verified",
      verifiedAt,
      sourceNote: `Field survey at ${stationName}`,
      // Only escalators have a meaningful direction; stairs and lifts serve both.
      ...(id === "escalator" ? { travel } : {}),
      // Only the ones still listed: a target tapped all the way off must not
      // linger here as a worse way to somewhere this no longer goes.
      ...(secondaryFor.length > 0
        ? { secondaryFor: secondaryFor.filter((x) => leadsTo.includes(x)) }
        : {}),
    }));

    const json = JSON.stringify(
      {
        stationCode,
        direction,
        features,
        // Context for whoever reviews this. Which deployment it came from is
        // NOT sent from here: the server knows, and a value the browser can
        // set is a value a spammer can set to look like anything.
        note: note.trim() || undefined,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        locale,
        viewport:
          typeof window === "undefined"
            ? undefined
            : `${window.innerWidth}x${window.innerHeight}`,
      },
      null,
      2,
    );

    setStatus(t("survey.saving"));
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: json,
      });
      // Not every refusal comes from us. A rate limit is enforced at the edge
      // and answers with an HTML block page, so parsing it as JSON throws —
      // which used to land in the catch below and tell someone standing on a
      // platform with full signal that they were offline.
      const body = await res.json().catch(() => null);

      if (res.ok && body?.pending) {
        // Stored for review. Saying so plainly matters: the surveyor has just
        // stood on a platform for this and should know it arrived, and also
        // that it is not live yet.
        setStatus(
          features.length > 1
            ? t("survey.submittedMany", { count: features.length })
            : t("survey.submitted"),
        );
        setPayload(null);
        setSent(true);
      } else if (res.ok && body) {
        setStatus(t("survey.saved", { count: body.count }));
        setPayload(null);
        setSent(true);
      } else if (res.status === 429) {
        // Too many submissions from this address. Say so, and keep the work:
        // one carrier can put a whole platform behind a single IP, so this
        // reaches people who have done nothing wrong.
        setStatus(t("survey.tooMany"));
        setPayload(json);
      } else if (!body || body.retain) {
        // Nowhere to store it, or an answer we cannot read. Hand back the
        // work rather than lose it.
        setStatus(t("survey.offline"));
        setPayload(json);
      } else {
        setStatus(t("survey.rejected", { reason: body.details?.join("; ") ?? body.error }));
        setPayload(null);
      }
    } catch {
      setStatus(t("survey.offline"));
      setPayload(json);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Step n={1} title={t("survey.step1")} hint={t("survey.tapHint")}>
        {/* The train IS the input. Reading "3.2" off a grid of 24 buttons and
            mapping it onto the train in front of you is exactly the translation
            step a surveyor should not have to do. */}
        <div className="border-3 border-[var(--border)] bg-bg-sunken p-2">
          <PlatformDiagram
            line={line}
            direction={direction}
            features={existing}
            highlightDoorIndex={doorIndex ?? undefined}
            towards={towards}
            avatar={doorIndex != null ? settings.avatar : undefined}
            skinTone={settings.skinTone}
            fitWidth
            doorSide={doorSide}
            onSelectDoor={setDoorIndex}
            doorLabel={describeDoor}
            label={t("survey.step1")}
            noDataLabel={t("line.noFleetData")}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={t("survey.nudgePrev")}
            className="pixel-btn flex h-11 w-11 shrink-0 items-center justify-center text-lg"
          >
            ‹
          </button>
          <p className="font-pixel flex-1 text-center text-[11px] leading-relaxed text-accent">
            {position
              ? describeDoor(doorIndex!)
              : <span className="text-fg-faint">{t("survey.nothingSelected")}</span>}
          </p>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={t("survey.nudgeNext")}
            className="pixel-btn flex h-11 w-11 shrink-0 items-center justify-center text-lg"
          >
            ›
          </button>
        </div>
      </Step>

      <Step n={2} title={t("survey.step2")} hint={t("survey.step2Hint")}>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((id) => (
            <Choice key={id} active={types.includes(id)} onClick={() => toggleType(id)}>
              {t(`mode.${id}` as MessageKey)}
            </Choice>
          ))}
        </div>
      </Step>

      {hasTravelStep && (
        <Step n={3} title={t("survey.travelHeading")} hint={t("survey.travelHint")}>
          <div className="grid grid-cols-3 gap-2">
            {TRAVELS.map((dir) => (
              <Choice key={dir} active={travel === dir} onClick={() => setTravel(dir)}>
                {t(`travel.${dir}` as MessageKey)}
              </Choice>
            ))}
          </div>
        </Step>
      )}

      <Step
        n={hasTravelStep ? 4 : 3}
        title={`${t("survey.step3")}${targetRequired ? "" : ` ${t("survey.optional")}`}`}
        hint={needsTarget ? t("survey.targetRequired", { type: typeLabel }) : undefined}
      >
        {/* Exits and interchange lines are offered together because they are
            the same question. The escalator into the Circle Line corridor may
            also be the one to Exit C, and it should be recordable as both. */}
        {exitCodes.length > 0 && (
          <>
            <p className="font-pixel text-[10px] uppercase text-fg-faint">
              {t("survey.leadsToExits")}
            </p>
            <div className="mb-3 mt-2 flex flex-wrap gap-2">
              {exitCodes.map((code) => (
                <Choice
                  key={`exit-${code}`}
                  active={leadsTo.includes(code)}
                  demoted={secondaryFor.includes(code)}
                  onClick={() => toggleTarget(code)}
                >
                  {t("route.exitLabel", { code })}
                  {secondaryFor.includes(code) && ` ${t("survey.longWayMark")}`}
                </Choice>
              ))}
            </div>
          </>
        )}

        {interchanges.length > 0 && (
          <>
            <p className="font-pixel text-[10px] uppercase text-fg-faint">
              {t("survey.leadsToLines")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {interchanges.map((code) => (
                <Choice
                  key={`line-${code}`}
                  active={leadsTo.includes(code)}
                  demoted={secondaryFor.includes(code)}
                  onClick={() => toggleTarget(code)}
                >
                  {code}
                  {secondaryFor.includes(code) && ` ${t("survey.longWayMark")}`}
                </Choice>
              ))}
            </div>
          </>
        )}

        {exitCodes.length === 0 && interchanges.length === 0 && (
          <p className="text-sm text-fg-muted">{t("survey.noExits")}</p>
        )}

        {leadsTo.length > 0 && (
          <p className="mt-4 border-t-2 border-[var(--border)] pt-3 text-sm leading-relaxed text-fg-muted">
            {t("survey.longWayHint")}
          </p>
        )}
      </Step>

      {/* All optional, and asked for after the survey itself so nothing here
          stands between a commuter on a platform and the thing they came to
          record. A note is often the whole review — "the escalator was out,
          this is the stairs beside it" settles a submission that the numbers
          alone would leave ambiguous. */}
      <Step n={hasTravelStep ? 5 : 4} title={t("survey.step4")} hint={t("survey.step4Hint")}>
        <label className="block">
          <span className="text-sm text-fg-muted">{t("survey.noteLabel")}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="pixel-box-sm mt-2 block w-full resize-y bg-bg-raised px-3 py-2 text-base text-fg"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-sm text-fg-muted">{t("survey.nameLabel")}</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="pixel-box-sm mt-2 block min-h-12 w-full appearance-none rounded-none bg-bg-raised px-3 py-3 text-base text-fg"
          />
        </label>
        {/* The only reason to hold an address is to ask a question back, so the
            label says that rather than leaving someone to guess what it is for. */}
        <label className="mt-3 block">
          <span className="text-sm text-fg-muted">{t("survey.emailLabel")}</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            className="pixel-box-sm mt-2 block min-h-12 w-full appearance-none rounded-none bg-bg-raised px-3 py-3 text-base text-fg"
          />
        </label>
      </Step>

      <button
        type="button"
        onClick={save}
        disabled={!ready || sent}
        className="pixel-btn font-pixel px-4 py-4 text-xs uppercase"
        style={
          ready ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined
        }
      >
        {t("survey.save")}
      </button>

      {status && (
        <p className="pixel-box-sm p-3 text-sm leading-relaxed" role="status">
          {status}
        </p>
      )}
      {payload && (
        <pre className="pixel-box-sm overflow-x-auto p-3 text-[10px] leading-relaxed">
          {payload}
        </pre>
      )}
    </div>
  );
}
