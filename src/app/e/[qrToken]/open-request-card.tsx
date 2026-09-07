import Link from "next/link";
import { CalendarClock, ClipboardList, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { formatRelativeTime } from "@/lib/format";
import { formatZonedDateTime } from "@/lib/schedule";
import type { OpenRequestSummary } from "@/lib/types";

// "Already reported" — the point of resolve_qr_code() returning
// `open_requests` (migration 0019): a second person scanning the same
// sticker sees what's already in flight instead of filing a duplicate.
// Anyone holding the sticker can see this by design (see the Next roadmap
// brief's product guardrails) — first name only, never contact details.

const MAX_SHOWN = 3;

/** The company's own zone (0023) — the server's clock is UTC on Vercel, which is not where the visit is. */
function formatVisitDate(iso: string, timeZone: string | null | undefined): string {
  return formatZonedDateTime(iso, timeZone || "UTC");
}

function OpenRequestRow({
  request,
  timeZone,
}: {
  request: OpenRequestSummary;
  timeZone: string | null | undefined;
}) {
  return (
    <Link
      href={`/r/${request.public_token}`}
      className="block rounded-xl border bg-background px-4 py-3 transition-colors active:translate-y-px"
    >
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={request.status} />
        <span className="text-xs text-muted-foreground">
          {request.update_count} update{request.update_count === 1 ? "" : "s"}
        </span>
      </div>

      <p className="mt-2 text-sm">
        Reported {formatRelativeTime(request.created_at)} by{" "}
        {request.contact_first_name || "a customer"}
      </p>

      {request.description && (
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{request.description}</p>
      )}

      {request.scheduled_for && (
        <p className="mt-2 flex items-center gap-1.5 text-sm">
          <CalendarClock className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
          Visit scheduled {formatVisitDate(request.scheduled_for, timeZone)}
        </p>
      )}

      {request.assigned_to_name && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <UserRound className="size-4 shrink-0" aria-hidden />
          Tech: {request.assigned_to_name}
        </p>
      )}

      <p className="mt-2 text-sm font-semibold text-[var(--brand)]">View status &amp; add a note →</p>
    </Link>
  );
}

/**
 * Renders up to {@link MAX_SHOWN} open requests on this unit, newest first
 * (already sorted that way by resolve_qr_code()), with "and N more" for the
 * rest rather than growing the card without bound. Returns null when there's
 * nothing open so callers can render it unconditionally.
 */
export function OpenRequestsCard({
  requests,
  timeZone,
}: {
  requests: OpenRequestSummary[];
  /** Company timezone from resolve_qr_code (absent on payloads cached before 0023). */
  timeZone?: string | null;
}) {
  if (requests.length === 0) return null;

  const shown = requests.slice(0, MAX_SHOWN);
  const remaining = requests.length - shown.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <ClipboardList className="size-4" aria-hidden />
        {requests.length === 1 ? "Already reported" : `Already reported (${requests.length})`}
      </div>

      <div className="space-y-2">
        {shown.map((request) => (
          <OpenRequestRow key={request.id} request={request} timeZone={timeZone} />
        ))}
      </div>

      {remaining > 0 && (
        <p className="text-center text-xs text-muted-foreground">and {remaining} more</p>
      )}
    </div>
  );
}
