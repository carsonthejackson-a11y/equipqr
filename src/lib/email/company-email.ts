import "server-only";
import { sendEmail } from "./send";
import { sanitizeEmailHeader } from "./layout";

// A customer/vendor/reporter reading a status update, resolution notice or
// dispatch email should see it as coming from the COMPANY they contacted,
// not from "EquipQR" (I1 §4.4: the resolution email was the one customer
// email that wasn't company-branded). Use sendCompanyEmail() for anything
// like that; keep using sendEmail() directly for staff-facing mail
// (invites, trial reminders, the new-request notification), which stays
// plain EquipQR-branded on purpose.

const MAX_FROM_NAME_LENGTH = 60;
const FROM_NAME_SUFFIX = " via EquipQR";

/**
 * Builds the From display name for a company-branded email:
 * "<Company> via EquipQR", with a company name (user-typed, so untrusted)
 * made safe for a raw email header — CR/LF stripped (so it can't inject a
 * second header line), quotes and angle brackets removed (so it can't
 * prematurely close the display-name/open an address section), internal
 * whitespace collapsed, and the result capped to about 60 characters.
 * Falls back to plain "EquipQR" when the name sanitizes down to nothing
 * (blank, or entirely punctuation).
 *
 * Exported standalone (rather than folded into sendCompanyEmail) so this
 * string-building has direct unit-test coverage without exercising the
 * network call. Feed the result straight into sendEmail()'s `fromName`.
 */
export function buildFromHeader(companyName: string): string {
  const cleaned = companyName
    .replace(/[\r\n]+/g, " ")
    .replace(/["<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "EquipQR";

  const maxNameLength = Math.max(0, MAX_FROM_NAME_LENGTH - FROM_NAME_SUFFIX.length);
  const name = cleaned.length > maxNameLength ? cleaned.slice(0, maxNameLength).trim() : cleaned;

  return `${name}${FROM_NAME_SUFFIX}`;
}

/**
 * Resolves the Reply-To header for a company-branded email: `replyTo` when
 * given (covers e.g. "reply routes to the assigned technician"), else the
 * company's own notification_email. Either way the result is run through
 * sanitizeEmailHeader() (src/lib/email/layout.ts) — returns `undefined`
 * (meaning: omit the header entirely) for a missing or invalid address
 * rather than forwarding something that could be a header-injection
 * attempt.
 */
export function buildReplyTo(
  replyTo: string | null | undefined,
  notificationEmail: string | null
): string | undefined {
  const candidate = replyTo ?? notificationEmail;
  if (!candidate) return undefined;
  return sanitizeEmailHeader(candidate) ?? undefined;
}

export type SendCompanyEmailParams = {
  company: { name: string; notification_email: string | null };
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Overrides company.notification_email as the Reply-To (e.g. route replies to whoever's assigned). Omit/null to use the company's own inbox. */
  replyTo?: string | null;
};

/**
 * Sends a customer/vendor-facing email "from" the company — From:
 * "<Company> via EquipQR <address>" (see buildFromHeader), Reply-To: the
 * company's own inbox unless `params.replyTo` overrides it (see
 * buildReplyTo) — instead of the plain EquipQR-branded sender sendEmail()
 * produces on its own.
 *
 * Never throws — mirrors sendEmail() exactly, since every caller here
 * already treats email as best-effort and none of them wrap this in their
 * own try/catch. Returns `{ sent, to }` so a caller that records a
 * `*_email_sent_at` timestamp only does so when `sent` is true.
 */
export async function sendCompanyEmail(
  params: SendCompanyEmailParams
): Promise<{ sent: boolean; to: string }> {
  const { company, to, subject, html, text, replyTo } = params;

  try {
    const sent = await sendEmail({
      to,
      subject,
      html,
      text,
      fromName: buildFromHeader(company.name),
      replyTo: buildReplyTo(replyTo, company.notification_email),
    });
    return { sent, to };
  } catch (err) {
    console.error(`sendCompanyEmail: failed to send "${subject}" to ${to}:`, err);
    return { sent: false, to };
  }
}
