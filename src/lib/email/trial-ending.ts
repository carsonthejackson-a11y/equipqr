import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";

/** Sent ~3 days before a company's trial ends, to its owner(s), when there's still no active subscription. See src/app/api/cron/trial-reminders/route.ts. Idempotent via companies.trial_reminder_sent_at. */
export function buildTrialEndingEmail({
  companyName,
  daysLeft,
  billingUrl,
}: {
  companyName: string;
  daysLeft: number;
  billingUrl: string;
}): { subject: string; html: string; text: string } {
  const dayWord = daysLeft === 1 ? "day" : "days";
  const subject =
    daysLeft <= 0
      ? `${companyName}'s EquipQR trial ends today`
      : `${companyName}'s EquipQR trial ends in ${daysLeft} ${dayWord}`;
  const cta: EmailCta = { label: "Choose a plan", url: billingUrl };

  const bodyHtml = [
    `<p>Your free trial of EquipQR for <strong>${escapeHtml(companyName)}</strong> ${
      daysLeft <= 0 ? "ends today" : `ends in ${daysLeft} ${dayWord}`
    }.</p>`,
    `<p>Pick a plan before then to keep your team, equipment, and customer-facing QR pages working without interruption.</p>`,
  ].join("");

  const html = renderEmail({
    heading: daysLeft <= 0 ? "Your trial ends today" : "Your trial is ending soon",
    bodyHtml,
    cta,
    footerNote: "Already subscribed? You can ignore this — it can take a few minutes to reflect.",
  });

  const text = renderEmailText({
    heading: `Your free trial of EquipQR for ${companyName} ${
      daysLeft <= 0 ? "ends today" : `ends in ${daysLeft} ${dayWord}`
    }.`,
    lines: [
      "Pick a plan before then to keep your team, equipment, and customer-facing QR pages working without interruption.",
    ],
    cta,
    footerNote: "Already subscribed? You can ignore this — it can take a few minutes to reflect.",
  });

  return { subject, html, text };
}
