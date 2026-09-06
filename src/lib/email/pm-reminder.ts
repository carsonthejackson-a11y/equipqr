import { renderEmail, renderEmailText, escapeHtml, type EmailCta } from "./layout";

/** One line of the digest: a unit that is due (or overdue) for preventive maintenance. */
export type PmReminderUnit = {
  name: string;
  customer: string | null;
  location: string | null;
  /** "YYYY-MM-DD" */
  dueOn: string;
  /** "overdue by 3 days" / "due in 5 days" — from describeDue() in src/lib/pm-reminders.ts. */
  description: string;
  /** Absolute link to /dashboard/equipment/<id>. */
  url: string;
};

/**
 * The staff-facing daily digest sent to a company's notification inbox by
 * src/app/api/cron/pm-reminders/route.ts: one email per company listing
 * every unit whose service is due within the reminder window. EquipQR-branded
 * (no company `brand`), like the other staff emails.
 */
export function buildPmReminderEmail({
  companyName,
  units,
  equipmentListUrl,
}: {
  companyName: string;
  units: PmReminderUnit[];
  /** Link to the pre-filtered equipment list (`?pm=due_soon`). */
  equipmentListUrl: string;
}): { subject: string; html: string; text: string } {
  const count = units.length;
  const overdue = units.filter((u) => u.description.startsWith("overdue")).length;
  const unitWord = count === 1 ? "unit" : "units";
  const subject =
    overdue > 0
      ? `Maintenance due: ${count} ${unitWord} (${overdue} overdue) — ${companyName}`
      : `Maintenance due: ${count} ${unitWord} — ${companyName}`;
  const cta: EmailCta = { label: "Open the equipment list", url: equipmentListUrl };

  const rowsHtml = units
    .map((unit) => {
      const where = [unit.customer, unit.location]
        .filter((part): part is string => !!part)
        .map(escapeHtml)
        .join(" · ");
      const isOverdue = unit.description.startsWith("overdue");
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <a href="${escapeHtml(unit.url)}" style="color:#0f172a;font-weight:600;text-decoration:none;">${escapeHtml(unit.name)}</a>
          ${where ? `<div style="font-size:13px;color:#64748b;">${where}</div>` : ""}
        </td>
        <td style="padding:10px 0 10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;white-space:nowrap;">
          <div style="font-size:13px;color:${isOverdue ? "#b91c1c" : "#0f172a"};font-weight:${isOverdue ? "600" : "400"};">${escapeHtml(unit.description)}</div>
          <div style="font-size:12px;color:#64748b;">${escapeHtml(unit.dueOn)}</div>
        </td>
      </tr>`;
    })
    .join("");

  const bodyHtml = [
    `<p>${count === 1 ? "One unit is" : `${count} units are`} due for preventive maintenance in the next week${
      overdue > 0 ? `, including ${overdue} already overdue` : ""
    }.</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${rowsHtml}</table>`,
  ].join("");

  const html = renderEmail({
    heading: `Maintenance due — ${companyName}`,
    bodyHtml,
    cta,
    footerNote:
      "You get one reminder per due date. Logging a service visit on the unit moves its next due date and clears this. Set intervals under each unit's Details tab.",
  });

  const text = renderEmailText({
    heading: `Maintenance due — ${companyName}`,
    lines: [
      `${count === 1 ? "One unit is" : `${count} units are`} due for preventive maintenance in the next week${
        overdue > 0 ? `, including ${overdue} already overdue` : ""
      }.`,
      null,
      ...units.map((unit) => {
        const where = [unit.customer, unit.location].filter(Boolean).join(" · ");
        return `- ${unit.name}${where ? ` (${where})` : ""}: ${unit.description}, ${unit.dueOn}\n  ${unit.url}`;
      }),
    ],
    cta,
    footerNote:
      "You get one reminder per due date. Logging a service visit on the unit moves its next due date and clears this.",
  });

  return { subject, html, text };
}
