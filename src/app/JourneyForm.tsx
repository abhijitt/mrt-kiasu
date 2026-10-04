"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { stationSlug } from "@/lib/station-slug";
import { useEffect, useState } from "react";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { StationPicker, type StationOption } from "@/components/StationPicker";
import { useT } from "@/i18n/I18nProvider";

/**
 * Origin and destination, laid out as a connected journey strip.
 *
 * The marker rail down the left — filled dot, dotted line, square — is the
 * convention every transit app uses, and it makes the direction of travel
 * legible at a glance in a way two stacked labelled inputs did not.
 *
 * What the commuter is heading for (escalator, lift, stairs) lives in Settings:
 * it is a standing preference, not a per-journey decision.
 */
export function JourneyForm({ stations }: { stations: StationOption[] }) {
  const router = useRouter();
  const t = useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ready = from !== "" && to !== "" && from !== to;
  const target = ready ? `/route/${stationSlug(from)}/${stationSlug(to)}` : null;

  // Load the route the moment both stations are chosen, not at the tap. The
  // page renders on demand, and the server behind it sleeps when idle: a
  // cold first request took 1.9 s where a warm one takes 0.1 s, and that wait
  // used to start at the tap. Now it starts while the commuter is still
  // looking at the screen, and the tap shows a page that has already arrived.
  //
  // Full, not the default: for an on-demand page the default fetches only the
  // loading skeleton, and the wait would just move. And by hand rather than
  // as a <Link prefetch>, which in this Next.js version never fetched a link
  // that appeared after the page loaded, on sight or on hover; calling the
  // router does. PrefetchKind is internal to Next, so a failure here must
  // cost only the head start, never the form.
  useEffect(() => {
    if (!target) return;
    try {
      router.prefetch(target, { kind: PrefetchKind.FULL });
    } catch {
      // The tap will still load the page; it just will not be early.
    }
  }, [router, target]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (target) router.push(target);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-3">
        {/* Marker rail: origin dot, dotted run, destination square. */}
        <div className="flex w-3 shrink-0 flex-col items-center pt-7">
          <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[var(--border)] bg-accent" />
          <span
            className="my-1 w-0.5 flex-1"
            style={{
              backgroundImage:
                "repeating-linear-gradient(180deg, var(--border-soft) 0 3px, transparent 3px 6px)",
            }}
          />
          <span className="mb-7 h-3 w-3 shrink-0 border-2 border-[var(--border)] bg-fg" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <StationPicker
            label={t("form.from")}
            value={from}
            onChange={setFrom}
            stations={stations}
            exclude={to}
          />
          <StationPicker
            label={t("form.to")}
            value={to}
            onChange={setTo}
            stations={stations}
            exclude={from}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          disabled={!from && !to}
          aria-label={t("form.swap")}
          title={t("form.swap")}
          className="pixel-btn mt-7 flex h-10 w-10 shrink-0 items-center justify-center self-start text-lg"
        >
          <span aria-hidden>⇅</span>
        </button>
      </div>

      <button
        type="submit"
        disabled={!ready}
        className="pixel-btn font-pixel px-4 py-4 text-xs uppercase"
        style={ready ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined}
      >
        {t("form.submit")}
      </button>

      {/* Secondary to the search box, not a rival to it. Typing is faster for
          anyone who knows the station name, and it is the path that works
          with a screen reader. */}
      <Link
        href="/map"
        className="pixel-btn font-pixel flex min-h-11 items-center justify-center px-4 py-3 text-[11px] uppercase text-fg-muted"
      >
        {t("map.open")}
      </Link>
    </form>
  );
}
