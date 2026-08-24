"use client";

import { useEffect, useState } from "react";
import { useT } from "@/i18n/I18nProvider";

interface AlertsResponse {
  configured: boolean;
  disrupted?: boolean;
  messages?: { Content: string; CreatedDate: string }[];
  stale?: boolean;
}

/**
 * Live service notices.
 *
 * Collapsed by default: most of the time these are long-running planned
 * adjustments that would otherwise push the actual app below the fold. A real
 * disruption opens automatically, since that is worth interrupting for.
 */
export function AlertBanner() {
  const t = useT();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lta/alerts")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setData(json);
        if (json?.disrupted) setOpen(true);
      })
      .catch(() => {
        // Alerts are supplementary — never break the page over them.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data?.configured) return null;

  const messages = data.messages ?? [];
  if (!data.disrupted && messages.length === 0) return null;

  const disrupted = Boolean(data.disrupted);

  return (
    <section
      className="pixel-box overflow-hidden"
      style={
        disrupted ? { background: "var(--danger)", color: "#fff" } : undefined
      }
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="font-pixel text-xs uppercase">
          {disrupted ? `⚠ ${t("alerts.disruption")}` : t("alerts.notices")}
        </span>
        <span className="pixel-box-sm ml-auto px-2 py-0.5 font-pixel text-[11px]">
          {messages.length}
        </span>
        <span aria-hidden className="font-pixel text-sm">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-[var(--border)] px-4 py-3">
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.CreatedDate + m.Content.slice(0, 24)}
                className="text-sm leading-relaxed"
              >
                {m.Content}
              </li>
            ))}
          </ul>
          {data.stale && (
            <p className="mt-3 text-xs opacity-70">
              {t("alerts.stale")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
