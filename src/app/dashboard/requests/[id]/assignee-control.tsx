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
import type { CompanyMember } from "@/lib/types";
import { assignRequest } from "../actions";

const UNASSIGNED = "__unassigned__";

export function AssigneeControl({
  requestId,
  assignedTo,
  members,
}: {
  requestId: string;
  assignedTo: string | null;
  members: CompanyMember[];
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string | null) {
    if (!value) return;
    const userId = value === UNASSIGNED ? null : value;
    if (userId === assignedTo) return;

    startTransition(async () => {
      const result = await assignRequest(requestId, userId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(userId ? "Assigned" : "Unassigned");
      }
    });
  }

  const items: Record<string, string> = {
    [UNASSIGNED]: "Unassigned",
    ...Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || m.email])),
  };

  return (
    <Select value={assignedTo ?? UNASSIGNED} onValueChange={handleChange} items={items} disabled={isPending}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.full_name?.trim() || m.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
