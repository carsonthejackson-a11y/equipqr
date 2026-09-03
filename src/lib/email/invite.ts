import type { UserRole } from "@/lib/types";

const ROLE_LABEL: Record<UserRole, string> = {
  owner: "an owner",
  technician: "a technician",
};

// Plain function (no Resend dependency) so the invite email content can be
// reused from the server action that sends it and, if needed, from a resend
// path — matches the { subject, html, text } shape rather than reaching for
// a template file, since this is the only transactional email besides the
// service-request notification.
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

  const text = [
    `You've been invited to join ${companyName} on EquipQR as ${roleLabel}.`,
    "",
    `Accept your invitation: ${inviteUrl}`,
    "",
    "This link expires in 7 days.",
    "",
    "If you weren't expecting this, you can safely ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a;">
      <p style="font-size:16px;line-height:1.5;">
        You've been invited to join <strong>${escapeHtml(companyName)}</strong> on EquipQR as ${roleLabel}.
      </p>
      <p style="margin:24px 0;">
        <a
          href="${inviteUrl}"
          style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;"
        >
          Accept invitation
        </a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#64748b;">
        Or paste this link into your browser:<br />
        <a href="${inviteUrl}" style="color:#64748b;">${inviteUrl}</a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#64748b;">
        This link expires in 7 days. If you weren't expecting this, you can safely ignore this email.
      </p>
    </div>
  `.trim();

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
