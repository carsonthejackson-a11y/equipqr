import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";
import type { CompanyKind } from "@/lib/types";

const PROVIDER_STEPS = [
  "Create an equipment type for the gear you service",
  "Add a troubleshooting guide so customers can self-serve before a truck roll",
  "Add your first piece of equipment and print or download its QR label",
  "Invite a teammate",
];

// Mirrors the owner first-run wizard (location, then equipment types —
// docs/OWNER-ROADMAP-BRIEF.md §3.2) plus the two things worth doing right
// after it: putting a scannable poster where staff can actually use it, and
// adding a vendor so a reported problem routes itself.
const OWNER_STEPS = [
  "Add your location (or locations)",
  "Add your equipment, or start from the built-in restaurant equipment types",
  "Print a QR poster for each location so staff can scan and report a problem",
  "Add a vendor so work orders route to them automatically",
];

const PROVIDER_TRIAL_LINE =
  "You're on a 14-day free trial with full access — here's how to get the most out of it:";
const OWNER_TRIAL_LINE =
  "You're on a 14-day trial of EquipQR's Kitchen features — after that you'll automatically move to the Free plan (1 location, 10 units); your account never locks. Here's how to get started:";

/**
 * Sent once, right after a company is created (see src/app/dashboard/layout.tsx).
 * Idempotent via companies.welcome_email_sent_at.
 *
 * Per-kind (C1-05): the old copy always said "gear you service", "self-serve
 * before a truck roll" and "14-day free trial with full access" — every
 * word wrong for an equipment_owner company, whose trial only ever covered
 * Kitchen-level features and who never actually loses access at all.
 */
export function buildWelcomeEmail({
  companyName,
  kind,
  recipientName,
  dashboardUrl,
}: {
  companyName: string;
  kind: CompanyKind;
  recipientName?: string | null;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `Welcome to EquipQR, ${companyName}!`;
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi there,";
  const cta: EmailCta = { label: "Go to your dashboard", url: dashboardUrl };

  const steps = kind === "equipment_owner" ? OWNER_STEPS : PROVIDER_STEPS;
  const trialLine = kind === "equipment_owner" ? OWNER_TRIAL_LINE : PROVIDER_TRIAL_LINE;

  const bodyHtml = [
    `<p>${greeting}</p>`,
    `<p><strong>${escapeHtml(companyName)}</strong> is set up on EquipQR. ${escapeHtml(trialLine)}</p>`,
    `<ol style="margin:16px 0;padding-left:20px;">${steps.map((s) => `<li style="margin:4px 0;">${escapeHtml(s)}</li>`).join("")}</ol>`,
  ].join("");

  const html = renderEmail({ heading: "Welcome to EquipQR", bodyHtml, cta });

  const text = renderEmailText({
    heading: `${greeting.replace(/,$/, "")} — ${companyName} is set up on EquipQR.`,
    lines: [trialLine, null, ...steps.map((s, i) => `${i + 1}. ${s}`)],
    cta,
  });

  return { subject, html, text };
}
