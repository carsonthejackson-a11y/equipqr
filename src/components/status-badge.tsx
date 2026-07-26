import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/types";

const labels: Record<RequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
};

const variants: Record<RequestStatus, "default" | "secondary" | "outline"> = {
  new: "default",
  in_progress: "secondary",
  resolved: "outline",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge variant={variants[status]}>{labels[status]}</Badge>;
}
