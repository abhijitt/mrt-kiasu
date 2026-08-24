"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    router.push(`/route/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
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
    </form>
  );
}
