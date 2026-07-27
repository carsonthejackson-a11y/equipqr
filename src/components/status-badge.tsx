import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RequestStatus } from "@/lib/types";

const labels: Record<RequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};

const styles: Record<RequestStatus, string> = {
  new: "bg-primary/15 text-primary border-primary/20",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400",
  resolved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge className={cn(styles[status], "border")}>{labels[status]}</Badge>;
}
