import { phoneHref } from "@/lib/branding";

// Tap-to-act links for phone numbers and addresses on staff-facing surfaces
// (request detail, schedule cards, the staff scan view) — Q-03/Q-34: a
// phone-only reporter currently gets no "on my way" text fallback, and
// there's no "Directions" link anywhere an address is shown, so techs
// copy/paste into Maps by hand.

/**
 * `tel:` link for a phone number, normalized the same way branding.ts's
 * public-facing phoneHref() already does (digits and a leading `+` only) —
 * reuses that function directly so a number renders identically as a
 * customer-facing "Call us" button and a staff-facing "Call" action.
 */
export function telHref(phone: string): string {
  return phoneHref("tel", phone);
}

/**
 * `sms:` link for a phone number, optionally pre-filling the message body.
 * With a body, this builds `sms:<digits>?&body=<encoded>` — the `?&`
 * (a bare `?` immediately followed by `&`, not a typo) is the one query
 * form that pre-fills the body on BOTH iOS, which historically wanted
 * `sms:<number>&body=...` with no leading `?`, AND Android, which wants
 * `sms:<number>?body=...`; sending both separators together satisfies
 * either parser. Omit `body` for a plain "text this number" link.
 */
export function smsHref(phone: string, body?: string): string {
  const base = phoneHref("sms", phone);
  return body ? `${base}?&body=${encodeURIComponent(body)}` : base;
}

/**
 * Google Maps search link for a free-text address — opens the native Maps
 * app on both iOS and Android (and a browser tab on desktop), unlike a
 * `maps:`/`geo:` URI scheme, each of which only one platform understands.
 * Use for "Directions" / "Open in Maps" links wherever a location's address
 * is shown (Q-34).
 */
export function mapsHref(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}
