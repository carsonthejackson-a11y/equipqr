// A client-safe (no "server-only") home for CompanyFormatters/companyFormatters
// specifically so a "use client" component can build one from a `timeZone`
// prop. Everything here is a thin, pure binding over src/lib/format.ts's
// company-time helpers — see that file for the actual formatting logic and
// its tests. company-context.ts (server-only) uses this same function to
// build CompanyContext.fmt, so a server page and a client component that
// receives its timezone as a prop always format identically.

import {
  formatCompanyDate,
  formatCompanyDateTime,
  formatCompanyLongDateTime,
  formatCompanyTime,
  safeTimeZone,
  type CompanyYearMode,
} from "@/lib/format";

/**
 * Company-zoned date/time formatters, all bound to one resolved IANA zone.
 * Build with {@link companyFormatters} instead of calling
 * formatCompanyDate/Time/etc. one at a time — this is what
 * `CompanyContext.fmt` (src/lib/company-context.ts) is, and what a client
 * component builds locally from a `timeZone` prop.
 */
export type CompanyFormatters = {
  /** "Sep 15, 7:59 PM" (+" CDT" with `zone: true`) — see formatCompanyDateTime. */
  dateTime(iso: string, opts?: { year?: CompanyYearMode; zone?: boolean }): string;
  /** "Sep 15" / "Sep 15, 2025" — see formatCompanyDate. */
  date(iso: string, opts?: { year?: CompanyYearMode }): string;
  /** "10:00 AM" (+" CDT" with `zone: true`) — see formatCompanyTime. */
  time(iso: string, opts?: { zone?: boolean }): string;
  /** "Wednesday, September 16 at 10:00 AM CDT" — see formatCompanyLongDateTime. */
  longDateTime(iso: string): string;
  /** The resolved IANA zone every method above formats in (already run through safeTimeZone — never null/invalid). */
  timeZone: string;
};

/**
 * Builds a {@link CompanyFormatters} bound to `timeZone`. Pure and
 * side-effect-free, so it's safe to call from a client component too —
 * unlike company-context.ts, this module has no "server-only" import.
 * Typical client use: a server component passes `timeZone={ctx.fmt.timeZone}`
 * (or `company.timezone` directly) as a prop, and the client component calls
 * `companyFormatters(timeZone)` itself rather than trying to pass functions
 * across the server/client boundary.
 *
 * `timeZone` is run through {@link safeTimeZone}, so null/undefined/invalid
 * all resolve to the company default zone instead of throwing.
 */
export function companyFormatters(timeZone: string | null | undefined): CompanyFormatters {
  const zone = safeTimeZone(timeZone);
  return {
    dateTime: (iso, opts) => formatCompanyDateTime(iso, zone, opts),
    date: (iso, opts) => formatCompanyDate(iso, zone, opts),
    time: (iso, opts) => formatCompanyTime(iso, zone, opts),
    longDateTime: (iso) => formatCompanyLongDateTime(iso, zone),
    timeZone: zone,
  };
}
