import type { UserRole } from "@/lib/types";
import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";

const ROLE_LABEL: Record<UserRole, string> = {
  owner: "an owner",
  technician: "a technician",
};

// Plain function (no Resend dependency) so the invite email content can be
// reused from the server action that sends it and, if needed, from a resend
// path — matches the { subject, html, text } shape every other template in
// src/lib/email returns.
export function buildInviteEmail({
  companyName,
  inviteUrl,
  role,
}: {
  companyName: string;
  inviteUrl: string;
  role: UserRole;
}): { subject: string; html: string; text: string } {
  const subject = `You're invited to join ${companyName} on EquipQR`;
  const roleLabel = ROLE_LABEL[role];
  const cta: EmailCta = { label: "Accept invitation", url: inviteUrl };

  const bodyHtml = `<p>You've been invited to join <strong>${escapeHtml(companyName)}</strong> on EquipQR as ${roleLabel}.</p>`;

  const footerNote = [
    "This link expires in 7 days. If you weren't expecting this, you can safely ignore this email.",
    `Or paste this link into your browser: <a href="${inviteUrl}" style="color:#64748b;">${inviteUrl}</a>`,
  ].join("<br /><br />");

  const html = renderEmail({ heading: "You're invited", bodyHtml, cta, footerNote });

  const text = renderEmailText({
    heading: `You've been invited to join ${companyName} on EquipQR as ${roleLabel}.`,
    lines: ["This link expires in 7 days.", "If you weren't expecting this, you can safely ignore this email."],
    cta,
  });

  return { subject, html, text };
}
