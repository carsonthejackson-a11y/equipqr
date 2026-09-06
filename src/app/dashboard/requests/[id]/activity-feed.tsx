import {
  StickyNote,
  MessageSquare,
  ArrowRightLeft,
  UserRound,
  Flag,
  Mail,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import type { RequestActivity, RequestActivityKind } from "@/lib/types";

const ACTIVITY_ICONS: Record<RequestActivityKind, LucideIcon> = {
  note: StickyNote,
  message: MessageSquare,
  status_change: ArrowRightLeft,
  assignment: UserRound,
  priority_change: Flag,
  email_sent: Mail,
  system: Info,
};

const ACTIVITY_KIND_LABELS: Record<RequestActivityKind, string> = {
  note: "Note",
  message: "Message",
  status_change: "Status change",
  assignment: "Assignment",
  priority_change: "Priority change",
  email_sent: "Email sent",
  system: "System",
};

/**
 * Renders a request's `request_activity` timeline, oldest first. Staff
 * author names are resolved from `staffNameById` (built from
 * get_company_members()) rather than a per-row query. Customer replies
 * (kind `message`, written from /r/<token>) get their own look so they
 * stand out from staff notes and audit rows; `customerName` (the
 * request's contact_name) labels them.
 */
export function ActivityFeed({
  items,
  staffNameById,
  customerName,
}: {
  items: RequestActivity[];
  staffNameById: Map<string, string>;
  customerName?: string | null;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="divide-y">
      {items.map((item) => {
        const isCustomerMessage = item.author_kind === "customer" && item.kind === "message";
        const Icon = isCustomerMessage ? MessageSquare : ACTIVITY_ICONS[item.kind];
        const author =
          item.author_kind === "customer"
            ? customerName?.trim() || "Customer"
            : item.author_kind === "system"
              ? "System"
              : (item.author_user_id && staffNameById.get(item.author_user_id)) || "Staff";
        const kindLabel = isCustomerMessage ? "Reply" : ACTIVITY_KIND_LABELS[item.kind];

        return (
          <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <div
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                isCustomerMessage ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"
              )}
            >
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{author}</span>
                <span>{kindLabel}</span>
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  {item.visibility === "customer" ? "Visible to customer" : "Internal"}
                </Badge>
                <span>· {formatRelativeTime(item.created_at)}</span>
              </div>
              {item.body &&
                (isCustomerMessage ? (
                  <p className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-sm whitespace-pre-wrap">
                    {item.body}
                  </p>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{item.body}</p>
                ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
