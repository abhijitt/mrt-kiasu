"use client";

import { useEffect, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/I18nProvider";
import {
  MESSAGE_MAX,
  REPORT_TYPES,
  type ErrorReport,
  type ReportType,
} from "@/lib/report-types";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "failed"; reason: string }
  | { kind: "nowhere"; payload: string };

/**
 * Error report form.
 *
 * Context is captured rather than asked for: someone standing on a platform
 * who has just found a wrong door position should be able to describe the
 * problem, not the page they are on.
 */
export function ReportForm({ subject }: { subject?: string }) {
  const { t, locale } = useI18n();
  const messageId = useId();
  const nameId = useId();
  const emailId = useId();

  const [type, setType] = useState<ReportType>("data");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const [context, setContext] = useState<ErrorReport["context"] | null>(null);

  useEffect(() => {
    setContext({
      path: window.location.pathname,
      locale,
      ...(subject ? { subject } : {}),
      reportedAt: new Date().toISOString(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
  }, [locale, subject]);

  const ready = message.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !context) return;

    const report: ErrorReport = {
      type,
      message: message.trim(),
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      context,
    };
    const json = JSON.stringify(report, null, 2);

    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });
      if (res.ok) {
        setStatus({ kind: "sent" });
        setMessage("");
        return;
      }
      const body = await res.json().catch(() => ({}));
      // 501 means nobody has configured an inbox — that's our problem, not the
      // reporter's, so hand them the text rather than losing what they wrote.
      if (res.status === 501) {
        setStatus({ kind: "nowhere", payload: json });
      } else {
        setStatus({
          kind: "failed",
          reason: body.details?.join("; ") ?? body.error ?? String(res.status),
        });
      }
    } catch {
      setStatus({ kind: "nowhere", payload: json });
    }
  }

  if (status.kind === "sent") {
    return (
      <p
        className="pixel-box anim-pop p-4 text-base leading-relaxed"
        style={{ borderColor: "var(--verified)", color: "var(--verified)" }}
        role="status"
      >
        {t("report.sent")}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="pixel-box p-4">
        <legend className="font-pixel px-1 text-xs uppercase text-fg-muted">
          {t("report.whatKind")}
        </legend>
        <div className="mt-2 flex flex-col gap-2">
          {REPORT_TYPES.map((id) => {
            const active = type === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setType(id)}
                aria-pressed={active}
                className="pixel-btn flex flex-col items-start gap-0.5 px-3 py-3 text-left"
                style={
                  active
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : undefined
                }
              >
                <span className="font-pixel text-[11px] uppercase">
                  {t(`report.type.${id}` as MessageKey)}
                </span>
                <span className="text-sm opacity-80">
                  {t(`report.type.${id}.hint` as MessageKey)}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="pixel-box p-4">
        <label htmlFor={messageId} className="font-pixel text-xs uppercase text-fg-muted">
          {t("report.details")}
        </label>
        <p className="mt-2 text-sm text-fg-muted">{t("report.detailsHint")}</p>
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={MESSAGE_MAX}
          required
          placeholder={t("report.placeholder")}
          className="pixel-box-sm mt-3 w-full resize-y bg-bg-raised px-3 py-3 text-base text-fg"
        />
        <p className="mt-1 text-right text-xs text-fg-faint">
          {message.length}/{MESSAGE_MAX}
        </p>
      </div>

      <div className="pixel-box p-4">
        <p className="font-pixel text-xs uppercase text-fg-muted">
          {t("report.name")} · {t("report.email")}{" "}
          <span className="text-fg-faint">({t("report.optional")})</span>
        </p>
        <p className="mt-2 text-sm text-fg-muted">{t("report.contactHint")}</p>
        <label htmlFor={nameId} className="sr-only">
          {t("report.name")}
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          placeholder={t("report.name")}
          className="pixel-box-sm mt-3 w-full bg-bg-raised px-3 py-3 text-base text-fg"
        />
        <label htmlFor={emailId} className="sr-only">
          {t("report.email")}
        </label>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder={t("report.email")}
          className="pixel-box-sm mt-2 w-full bg-bg-raised px-3 py-3 text-base text-fg"
        />
      </div>

      {/* Say plainly what rides along, rather than collecting it quietly. */}
      <details className="pixel-box-sm p-3">
        <summary className="font-pixel cursor-pointer text-[11px] uppercase text-fg-muted">
          {t("report.contextTitle")}
        </summary>
        <p className="mt-2 text-sm text-fg-muted">{t("report.contextNote")}</p>
        {context && (
          <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed text-fg-faint">
            {JSON.stringify(context, null, 2)}
          </pre>
        )}
      </details>

      <button
        type="submit"
        disabled={!ready || status.kind === "sending"}
        className="pixel-btn font-pixel px-4 py-4 text-xs uppercase"
        style={ready ? { background: "var(--accent)", color: "var(--accent-fg)" } : undefined}
      >
        {status.kind === "sending"
          ? t("report.sending")
          : ready
            ? t("report.submit")
            : t("report.needMessage")}
      </button>

      {status.kind === "failed" && (
        <p
          className="pixel-box-sm p-3 text-sm leading-relaxed"
          style={{ borderColor: "var(--danger)" }}
          role="alert"
        >
          {t("report.failed", { reason: status.reason })}
        </p>
      )}

      {status.kind === "nowhere" && (
        <div className="pixel-box-sm p-3" style={{ borderColor: "var(--candidate)" }}>
          <p className="text-sm leading-relaxed">{t("report.noDestination")}</p>
          <pre className="mt-2 max-h-48 overflow-auto text-[11px] leading-relaxed">
            {status.payload}
          </pre>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(status.payload);
                setCopied(true);
              } catch {
                // Clipboard can be blocked; the text is on screen to select.
              }
            }}
            className="pixel-btn font-pixel mt-3 px-3 py-2 text-[11px] uppercase"
          >
            {copied ? t("report.copied") : t("report.copy")}
          </button>
        </div>
      )}
    </form>
  );
}
