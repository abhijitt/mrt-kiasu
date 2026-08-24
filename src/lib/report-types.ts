/**
 * Error report shape and validation.
 *
 * Pure — no data imports — so the client form and the API route can share the
 * same rules without either pulling a dataset into the browser bundle.
 */

export const REPORT_TYPES = [
  "data",
  "translation",
  "bug",
  "suggestion",
  "other",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export interface ErrorReport {
  type: ReportType;
  /** What the person actually wants to tell us. */
  message: string;
  /** Optional, so we can reply. Never required. */
  name?: string;
  email?: string;
  /**
   * Captured automatically. A report saying "the door is wrong" is useless
   * without knowing which page it came from, so the form fills this in rather
   * than asking someone standing on a platform to describe where they are.
   */
  context: {
    path: string;
    locale: string;
    /** Station or route the report was opened from, when there is one. */
    subject?: string;
    reportedAt: string;
    /** Coarse client hint for reproducing rendering bugs. */
    viewport?: string;
  };
}

export const MESSAGE_MAX = 2000;
export const NAME_MAX = 80;
export const EMAIL_MAX = 254;

/** Deliberately permissive: rejecting valid addresses is worse than accepting junk. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateReport(report: Partial<ErrorReport>): string[] {
  const errors: string[] = [];

  if (!report.type || !REPORT_TYPES.includes(report.type)) {
    errors.push(`type must be one of ${REPORT_TYPES.join(", ")}`);
  }

  const message = report.message?.trim() ?? "";
  if (message.length === 0) {
    errors.push("message is required");
  } else if (message.length > MESSAGE_MAX) {
    errors.push(`message must be ${MESSAGE_MAX} characters or fewer`);
  }

  if (report.name && report.name.length > NAME_MAX) {
    errors.push(`name must be ${NAME_MAX} characters or fewer`);
  }

  if (report.email) {
    if (report.email.length > EMAIL_MAX) {
      errors.push(`email must be ${EMAIL_MAX} characters or fewer`);
    } else if (!looksLikeEmail(report.email)) {
      errors.push("email does not look like an address");
    }
  }

  if (!report.context?.path) {
    errors.push("context.path is required");
  }

  return errors;
}

/** Strips anything not in the schema, so a crafted body cannot smuggle fields through. */
export function sanitiseReport(input: Partial<ErrorReport>): ErrorReport {
  return {
    type: input.type as ReportType,
    message: (input.message ?? "").trim().slice(0, MESSAGE_MAX),
    ...(input.name?.trim() ? { name: input.name.trim().slice(0, NAME_MAX) } : {}),
    ...(input.email?.trim() ? { email: input.email.trim().slice(0, EMAIL_MAX) } : {}),
    context: {
      path: String(input.context?.path ?? "").slice(0, 300),
      locale: String(input.context?.locale ?? "").slice(0, 10),
      ...(input.context?.subject
        ? { subject: String(input.context.subject).slice(0, 120) }
        : {}),
      reportedAt: new Date().toISOString(),
      ...(input.context?.viewport
        ? { viewport: String(input.context.viewport).slice(0, 20) }
        : {}),
    },
  };
}
