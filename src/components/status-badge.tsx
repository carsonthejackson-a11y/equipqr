import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EquipmentStatus, RequestPriority, RequestStatus } from "@/lib/types";

// Single source of truth for request status / priority and equipment status
// labels + colours. Import REQUEST_STATUS_LABELS etc. anywhere a <select>
// needs the same list — never re-declare them locally.

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  scheduled: "Scheduled",
  on_hold: "On hold",
  resolved: "Resolved",
  canceled: "Canceled",
};

/** Statuses that count as "open" in the inbox. */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ["new", "in_progress", "scheduled", "on_hold"];
export const CLOSED_REQUEST_STATUSES: RequestStatus[] = ["resolved", "canceled"];

/** Canonical display order for every status — the inbox's StatusControl and any other full-status <select> should map over this instead of hand-rolling their own list. */
export const REQUEST_STATUS_ORDER: RequestStatus[] = [
  "new",
  "in_progress",
  "scheduled",
  "on_hold",
  "resolved",
  "canceled",
];

const requestStatusStyles: Record<RequestStatus, string> = {
  new: "bg-primary/15 text-primary border-primary/20",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400",
  scheduled: "bg-sky-500/15 text-sky-700 border-sky-500/20 dark:text-sky-400",
  on_hold: "bg-slate-500/15 text-slate-700 border-slate-500/20 dark:text-slate-300",
  resolved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  canceled: "bg-slate-500/10 text-muted-foreground border-slate-500/20 line-through",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge className={cn(requestStatusStyles[status], "border")}>{REQUEST_STATUS_LABELS[status]}</Badge>;
}

export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const priorityStyles: Record<RequestPriority, string> = {
  low: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
  normal: "bg-slate-500/10 text-foreground border-slate-500/20",
  high: "bg-orange-500/15 text-orange-700 border-orange-500/20 dark:text-orange-400",
  urgent: "bg-red-500/15 text-red-700 border-red-500/20 dark:text-red-400",
};

export function PriorityBadge({ priority }: { priority: RequestPriority }) {
  return <Badge className={cn(priorityStyles[priority], "border")}>{REQUEST_PRIORITY_LABELS[priority]}</Badge>;
}

/** Low -> urgent, for any full-priority <select> (PriorityControl, the inbox filter). */
export const REQUEST_PRIORITY_ORDER: RequestPriority[] = ["low", "normal", "high", "urgent"];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  active: "Active",
  needs_service: "Needs service",
  out_of_service: "Out of service",
  retired: "Retired",
};

const equipmentStatusStyles: Record<EquipmentStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
  needs_service: "bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400",
  out_of_service: "bg-red-500/15 text-red-700 border-red-500/20 dark:text-red-400",
  retired: "bg-slate-500/10 text-muted-foreground border-slate-500/20",
};

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <Badge className={cn(equipmentStatusStyles[status], "border")}>{EQUIPMENT_STATUS_LABELS[status]}</Badge>
  );
}
