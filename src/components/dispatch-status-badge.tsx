import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DISPATCH_STATUS_LABELS, dispatchSummary } from "@/lib/dispatch";
import type { DispatchStatus } from "@/lib/types";

// Server-safe status pill for a dispatch (owner roadmap — migrations
// 0024/0025). Shared by WS2 (owner dashboard) and WS3 (vendor page), which
// is why it lives in WS1's manifest instead of either sibling branch —
// docs/OWNER-ROADMAP-BRIEF.md §3.1.3.

const dispatchStatusStyles: Record<DispatchStatus, string> = {
  pending_approval: "bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400",
  sent: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  viewed: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  acknowledged: "bg-sky-500/15 text-sky-700 border-sky-500/20 dark:text-sky-400",
  eta_given: "bg-sky-500/15 text-sky-700 border-sky-500/20 dark:text-sky-400",
  finished: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * `status === null` renders nothing — a provider-kind request has no
 * dispatch, so callers can pass `serviceRequest.dispatch_status` straight
 * through without a conditional. When an ETA is set the pill shows it
 * directly ("ETA Tue 3:15 PM") rather than the generic "ETA given" label;
 * the full "<vendor> · <status/eta>" one-liner (from dispatchSummary()) is
 * set as the `title` for a hover tooltip.
 */
export function DispatchStatusBadge(props: {
  status: DispatchStatus | null;
  vendorName?: string | null;
  etaAt?: string | null;
  timeZone?: string | null;
  className?: string;
}) {
  const { status, vendorName = null, etaAt = null, timeZone = null, className } = props;
  if (status === null) return null;

  const label =
    status === "eta_given" && etaAt
      ? `ETA ${new Intl.DateTimeFormat("en-US", {
          timeZone: timeZone ?? "UTC",
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(etaAt))}`
      : DISPATCH_STATUS_LABELS[status];

  return (
    <Badge
      className={cn(dispatchStatusStyles[status], "border", className)}
      title={dispatchSummary({ status, vendorName, etaAt, timeZone })}
    >
      {label}
    </Badge>
  );
}
