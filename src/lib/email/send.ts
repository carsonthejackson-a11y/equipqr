import "server-only";
import { Resend } from "resend";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

/**
 * Sends one transactional email via Resend. No-ops with a console.warn when
 * RESEND_API_KEY/RESEND_FROM_EMAIL aren't configured, and never throws —
 * every caller in this app treats email as best-effort (a failed send must
 * never fail the request/action that triggered it). Returns whether the
 * send was attempted and succeeded, for callers that track e.g.
 * `*_email_sent_at` timestamps.
 */
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn(
      `RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping email "${subject}" to ${to}`
    );
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
    return true;
  } catch (err) {
    console.error(`Failed to send email "${subject}" to ${to}:`, err);
    return false;
  }
}
