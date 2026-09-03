import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";

/** Sent once, right after a company is created (see src/app/dashboard/layout.tsx). Idempotent via companies.welcome_email_sent_at. */
export function buildWelcomeEmail({
  companyName,
  recipientName,
  dashboardUrl,
}: {
  companyName: string;
  recipientName?: string | null;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Welcome to EquipQR, ${companyName}!`;
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi there,";
  const cta: EmailCta = { label: "Go to your dashboard", url: dashboardUrl };

  const steps = [
    "Create an equipment type for the gear you service",
    "Add a troubleshooting guide so customers can self-serve before a truck roll",
    "Add your first piece of equipment and print or download its QR label",
    "Invite a teammate",
  ];

  const bodyHtml = [
    `<p>${greeting}</p>`,
    `<p><strong>${escapeHtml(companyName)}</strong> is set up on EquipQR. You're on a 14-day free trial with full access — here's how to get the most out of it:</p>`,
    `<ol style="margin:16px 0;padding-left:20px;">${steps.map((s) => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join("")}</ol>`,
  ].join("");

  const html = renderEmail({ heading: "Welcome to EquipQR", bodyHtml, cta });

  const text = renderEmailText({
    heading: `${greeting.replace(/,$/, "")} — ${companyName} is set up on EquipQR.`,
    lines: [
      "You're on a 14-day free trial with full access. Here's how to get the most out of it:",
      null,
      ...steps.map((s, i) => `${i + 1}. ${s}`),
    ],
    cta,
  });

  return { subject, html, text };
}
