"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_ORDER } from "@/components/status-badge";
import type { CompanyMember } from "@/lib/types";

const STATUS_CHIPS: { label: string; value: string }[] = [
  { label: "All open", value: "open" },
  { label: "New", value: "new" },
  { label: "In progress", value: "in_progress" },
  { label: "Scheduled", value: "scheduled" },
  { label: "On hold", value: "on_hold" },
  { label: "Closed", value: "closed" },
];

const ALL_PRIORITIES = "all";
const ALL_ASSIGNEES = "all";
const ASSIGNEE_ME = "me";
const ASSIGNEE_UNASSIGNED = "unassigned";

export function RequestFilters({ members }: { members: CompanyMember[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const status = searchParams.get("status") ?? "open";
  const priority = searchParams.get("priority") ?? ALL_PRIORITIES;
  const assignee = searchParams.get("assignee") ?? ALL_ASSIGNEES;

  // The page below passes `key={params.q ?? ""}` so browser back/forward (or
  // anything else that changes the URL's q param) remounts this component —
  // resetting this local echo of it — instead of needing an effect that
  // calls setState on every render just to keep the two in sync.
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  function handleSearchChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setParams({ q: value.trim() || null });
    }, 350);
  }

  const priorityItems: Record<string, string> = {
    [ALL_PRIORITIES]: "All priorities",
    ...Object.fromEntries(REQUEST_PRIORITY_ORDER.map((p) => [p, REQUEST_PRIORITY_LABELS[p]])),
  };

  const assigneeItems: Record<string, string> = {
    [ALL_ASSIGNEES]: "Anyone",
    [ASSIGNEE_ME]: "Assigned to me",
    [ASSIGNEE_UNASSIGNED]: "Unassigned",
    ...Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || m.email])),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setParams({ status: chip.value === "open" ? null : chip.value })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              status === chip.value
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search description, contact, equipment…"
            className="pl-8"
          />
        </div>

        <Select
          value={priority}
          onValueChange={(value) => value && setParams({ priority: value === ALL_PRIORITIES ? null : value })}
          items={priorityItems}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(priorityItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={assignee}
          onValueChange={(value) => value && setParams({ assignee: value === ALL_ASSIGNEES ? null : value })}
          items={assigneeItems}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(assigneeItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
