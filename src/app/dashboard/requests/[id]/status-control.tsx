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
import type { RequestStatus } from "@/lib/types";
import { updateRequestStatus } from "../actions";

const options: { value: RequestStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

export function StatusControl({ requestId, status }: { requestId: string; status: RequestStatus }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: RequestStatus | null) {
    if (!value) return;
    startTransition(async () => {
      const result = await updateRequestStatus(requestId, value);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Status updated");
      }
    });
  }

  const items = Object.fromEntries(options.map((opt) => [opt.value, opt.label]));

  return (
    <Select value={status} onValueChange={handleChange} items={items} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
