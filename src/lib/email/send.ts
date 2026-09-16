import "server-only";
import { Resend } from "resend";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /**
   * Display name to send from, e.g. "Acme Repair via EquipQR" — builds a
   * `"<fromName> <address>"` From header, extracting the bare address out
   * of RESEND_FROM_EMAIL even when that's already in `"Display <addr>"`
   * form (see {@link extractFromAddress}). Omit for the plain
   * EquipQR-branded sender every staff-facing email already uses.
   *
   * Not itself sanitized against header injection (same rule as `replyTo`
   * above) — build it with buildFromHeader() / sendCompanyEmail() in
   * ./company-email rather than interpolating a company name in by hand.
   */
  fromName?: string;
};

/**
 * Extracts the bare address out of a From value that may already be in
 * `"Display Name <addr>"` form (RESEND_FROM_EMAIL can be configured either
 * way) or may just be a bare address already. Exported standalone so this
 * parsing has direct unit-test coverage without exercising the network call.
 */
export function extractFromAddress(fromValue: string): string {
  const match = /<([^<>]+)>/.exec(fromValue);
  return (match ? match[1] : fromValue).trim();
}

/**
 * Sends one transactional email via Resend. No-ops with a console.warn when
 * RESEND_API_KEY/RESEND_FROM_EMAIL aren't configured, and never throws —
 * every caller in this app treats email as best-effort (a failed send must
 * never fail the request/action that triggered it). Returns whether the
 * send was attempted and succeeded, for callers that track e.g.
 * `*_email_sent_at` timestamps.
 */
export async function sendEmail({ to, subject, html, text, replyTo, fromName }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn(
      `RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping email "${subject}" to ${to}`
    );
    return false;
  }

  // Without fromName this is `fromEmail` unchanged — every existing caller
  // (none of which pass fromName) sends exactly as before.
  const from = fromName ? `${fromName} <${extractFromAddress(fromEmail)}>` : fromEmail;

  try {
    const resend = new Resend(apiKey);
    // Resend's SDK resolves with an { data, error } tuple for API-level
    // failures (bad domain, rate limit, invalid recipient) instead of
    // throwing — only transport/unexpected errors reach the catch below.
    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error(`Failed to send email "${subject}" to ${to}:`, error);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Failed to send email "${subject}" to ${to}:`, err);
    return false;
  }
}
