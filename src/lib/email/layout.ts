import "server-only";

// Shared visual shell for every transactional email EquipQR sends. Keeping
// this in one place means a branding tweak (color, footer copy) happens
// once instead of drifting across each template file. Inline styles only —
// most email clients strip <style> blocks or ignore external stylesheets.

const BRAND_COLOR = "#0d9488"; // teal-600, matches the app's primary color
const TEXT_COLOR = "#0f172a";
const MUTED_COLOR = "#64748b";
const BORDER_COLOR = "#e2e8f0";
const SOFT_BG = "#f8fafc";

export type EmailCta = { label: string; url: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Optional sender branding for customer-facing emails (Pro+ "logo & colors").
 * Resolve it with resolveBranding() in src/lib/branding.ts — that applies the
 * plan gate — and pass the result straight through. Staff-facing emails
 * (new-request notification, invites, trial reminders) stay EquipQR-branded.
 */
export type EmailBrand = {
  name: string;
  color: string;
  onColor: string;
  logoUrl: string | null;
};

export type RenderEmailOptions = {
  heading: string;
  brand?: EmailBrand;
  /** Pre-built inner HTML (already escaped by the caller where needed). */
  bodyHtml: string;
  cta?: EmailCta;
  /** Small print below the main content — expiry notices, sign-offs, etc. May contain simple inline HTML (e.g. a link). */
  footerNote?: string;
};

/** Renders the full HTML document for a transactional email — teal header, card body, optional CTA button and footer note. */
export function renderEmail({ heading, bodyHtml, cta, footerNote, brand }: RenderEmailOptions): string {
  const headerColor = brand?.color ?? BRAND_COLOR;
  const headerText = brand?.onColor ?? "#ffffff";
  const headerContent = brand
    ? brand.logoUrl
      ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="32" style="display:block;max-height:32px;width:auto;" />`
      : `<span style="color:${headerText};font-size:17px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(brand.name)}</span>`
    : `<span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.01em;">EquipQR</span>`;
  const poweredBy = brand ? `${escapeHtml(brand.name)} · powered by EquipQR` : "EquipQR";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${SOFT_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT_BG};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BORDER_COLOR};">
            <tr>
              <td style="background:${headerColor};padding:18px 28px;">
                ${headerContent}
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:${TEXT_COLOR};">${escapeHtml(heading)}</h1>
                <div style="font-size:15px;line-height:1.6;color:${TEXT_COLOR};">${bodyHtml}</div>
                ${
                  cta
                    ? `<p style="margin:28px 0 0;">
                  <a
                    href="${cta.url}"
                    style="display:inline-block;background:${headerColor};color:${headerText};text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;"
                  >
                    ${escapeHtml(cta.label)}
                  </a>
                </p>`
                    : ""
                }
              </td>
            </tr>
            ${
              footerNote
                ? `<tr>
              <td style="padding:0 28px 24px;border-top:1px solid ${BORDER_COLOR};">
                <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED_COLOR};">${footerNote}</p>
              </td>
            </tr>`
                : ""
            }
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:${MUTED_COLOR};">${poweredBy}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export type PlainTextOptions = {
  heading: string;
  /** Body lines, in order. Falsy entries are dropped (use `null` for a blank separator you want to keep, or `false`/`undefined` for a line that only appears conditionally). */
  lines: (string | null | undefined | false)[];
  cta?: EmailCta;
  footerNote?: string | null;
};

/** Plain-text fallback for the same content `renderEmail` renders as HTML. */
export function renderEmailText({ heading, lines, cta, footerNote }: PlainTextOptions): string {
  // `null` becomes a kept blank line; `undefined`/`false` entries are dropped
  // entirely (for a line that only exists conditionally).
  const bodyLines = lines
    .filter((line): line is string | null => line !== undefined && line !== false)
    .map((line) => line ?? "");

  const trailer = [
    cta ? "" : null,
    cta ? `${cta.label}: ${cta.url}` : null,
    footerNote ? "" : null,
    footerNote ?? null,
  ].filter((line): line is string => line !== null && line !== undefined);

  return [heading, "", ...bodyLines, ...trailer].join("\n");
}
