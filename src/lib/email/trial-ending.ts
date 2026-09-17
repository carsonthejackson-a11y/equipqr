import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";
import type { CompanyKind } from "@/lib/types";

/**
 * Sent ~3 days before a company's trial ends, to its owner(s), when there's
 * still no active subscription. See src/app/api/cron/trial-reminders/route.ts.
 * Idempotent via companies.trial_reminder_sent_at.
 *
 * Per-kind copy (C1-34): every company has a `trial_ends_at`, but what
 * actually happens at the end of it is completely different for the two
 * kinds, and the old copy ("keep your team, equipment, and customer-facing
 * QR pages working without interruption") was wrong for both — a
 * service_provider's QR pages and intake never lock either, only the
 * dashboard does, and an equipment_owner never loses access to anything at
 * all; they just drop to the Free plan's limits.
 */
export function buildTrialEndingEmail({
  companyName,
  kind,
  daysLeft,
  billingUrl,
}: {
  companyName: string;
  kind: CompanyKind;
  daysLeft: number;
  billingUrl: string;
}): { subject: string; html: string; text: string } {
  const dayWord = daysLeft === 1 ? "day" : "days";
  const endsPhrase = daysLeft <= 0 ? "ends today" : `ends in ${daysLeft} ${dayWord}`;
  const cta: EmailCta = { label: "Choose a plan", url: billingUrl };

  const trialLabel = kind === "equipment_owner" ? "Kitchen trial" : "trial";
  const subject =
    daysLeft <= 0
      ? `${companyName}'s EquipQR ${trialLabel} ends today`
      : `${companyName}'s EquipQR ${trialLabel} ends in ${daysLeft} ${dayWord}`;
  const heading =
    kind === "equipment_owner"
      ? daysLeft <= 0
        ? "Your Kitchen trial ends today"
        : "Your Kitchen trial is ending soon"
      : daysLeft <= 0
        ? "Your trial ends today"
        : "Your trial is ending soon";

  const leadHtml =
    kind === "equipment_owner"
      ? `<p>Your 14-day trial of EquipQR's Kitchen features for <strong>${escapeHtml(companyName)}</strong> ${endsPhrase}.</p>`
      : `<p>Your free trial of EquipQR for <strong>${escapeHtml(companyName)}</strong> ${endsPhrase}.</p>`;
  const detailHtml =
    kind === "equipment_owner"
      ? `<p>After that, you'll automatically move to the Free plan — 1 location, 10 units, unlimited staff — and your account will never lock. Upgrade any time to keep the extra locations, equipment, AI troubleshooting and pre-printed QR batches; nothing is deleted either way.</p>`
      : `<p>After that, your dashboard will pause until you choose a plan. Your stickers, customer scan pages and incoming requests keep working the whole time, and nothing is deleted.</p>`;

  const leadText =
    kind === "equipment_owner"
      ? `Your 14-day trial of EquipQR's Kitchen features for ${companyName} ${endsPhrase}.`
      : `Your free trial of EquipQR for ${companyName} ${endsPhrase}.`;
  const detailText =
    kind === "equipment_owner"
      ? "After that, you'll automatically move to the Free plan — 1 location, 10 units, unlimited staff — and your account will never lock. Upgrade any time to keep the extra locations, equipment, AI troubleshooting and pre-printed QR batches; nothing is deleted either way."
      : "After that, your dashboard will pause until you choose a plan. Your stickers, customer scan pages and incoming requests keep working the whole time, and nothing is deleted.";

  const html = renderEmail({
    heading,
    bodyHtml: [leadHtml, detailHtml].join(""),
    cta,
    footerNote: "Already subscribed? You can ignore this — it can take a few minutes to reflect.",
  });

  const text = renderEmailText({
    heading: leadText,
    lines: [detailText],
    cta,
    footerNote: "Already subscribed? You can ignore this — it can take a few minutes to reflect.",
  });

  return { subject, html, text };
}
