"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_ORDER } from "@/components/status-badge";
import type { RequestPriority } from "@/lib/types";
import { updateRequestPriority } from "../actions";

export function PriorityControl({ requestId, priority }: { requestId: string; priority: RequestPriority }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: RequestPriority | null) {
    if (!value || value === priority) return;
    startTransition(async () => {
      const result = await updateRequestPriority(requestId, value);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Priority updated");
      }
    });
  }

  const items = Object.fromEntries(REQUEST_PRIORITY_ORDER.map((p) => [p, REQUEST_PRIORITY_LABELS[p]]));

  return (
    <Select value={priority} onValueChange={handleChange} items={items} disabled={isPending}>
      <SelectTrigger className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REQUEST_PRIORITY_ORDER.map((p) => (
          <SelectItem key={p} value={p}>
            {REQUEST_PRIORITY_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
