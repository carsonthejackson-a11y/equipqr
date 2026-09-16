"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { MessageSquare, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_ORDER } from "@/components/status-badge";
import { DISPATCH_STATUS_LABELS, DISPATCH_STATUS_ORDER } from "@/lib/dispatch";
import type { CompanyKind, CompanyMember } from "@/lib/types";

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
const ALL_DISPATCH = "all";

export function RequestFilters({
  members,
  kind = "service_provider",
}: {
  members: CompanyMember[];
  /** The dispatch-status filter only makes sense for equipment_owner companies (docs/OWNER-ROADMAP-BRIEF.md §3.2). */
  kind?: CompanyKind;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const bucket = searchParams.get("bucket");
  const status = searchParams.get("status") ?? "open";
  const priority = searchParams.get("priority") ?? ALL_PRIORITIES;
  const assignee = searchParams.get("assignee") ?? ALL_ASSIGNEES;
  const dispatch = searchParams.get("dispatch") ?? ALL_DISPATCH;
  // Next roadmap (two-way messaging): requests a customer has added a note to.
  const hasMessages = searchParams.get("messages") === "1";

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
    // A bucket link (e.g. an Overview "Unassigned" card) is a fixed
    // predicate (REQUEST_BUCKETS) that the discrete status/priority/assignee
    // params below can't express — see src/lib/request-queries.ts. Touching
    // any of those params here means the person is filtering by hand, so
    // drop `bucket` rather than silently combining two different queries.
    if (!("bucket" in updates)) params.delete("bucket");
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

  const dispatchItems: Record<string, string> = {
    [ALL_DISPATCH]: "Any dispatch status",
    ...Object.fromEntries(DISPATCH_STATUS_ORDER.map((s) => [s, DISPATCH_STATUS_LABELS[s]])),
  };

  const activeFilterCount =
    (priority !== ALL_PRIORITIES ? 1 : 0) +
    (assignee !== ALL_ASSIGNEES ? 1 : 0) +
    (kind === "equipment_owner" && dispatch !== ALL_DISPATCH ? 1 : 0) +
    (hasMessages ? 1 : 0);

  function fields(): ReactNode {
    return (
      <>
        <Select
          value={priority}
          onValueChange={(value) => value && setParams({ priority: value === ALL_PRIORITIES ? null : value })}
          items={priorityItems}
        >
          <SelectTrigger className="w-full sm:w-40">
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
          <SelectTrigger className="w-full sm:w-44">
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

        {kind === "equipment_owner" && (
          <Select
            value={dispatch}
            onValueChange={(value) => value && setParams({ dispatch: value === ALL_DISPATCH ? null : value })}
            items={dispatchItems}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(dispatchItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <button
          type="button"
          onClick={() => setParams({ messages: hasMessages ? null : "1" })}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
            hasMessages
              ? "border-primary bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <MessageSquare className="size-3.5" />
          Has customer messages
        </button>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {bucket && (
          <button
            type="button"
            onClick={() => setParams({ bucket: null, status: null })}
            className="flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm text-primary hover:bg-primary/15"
          >
            Filtered view · Clear
          </button>
        )}
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setParams({ status: chip.value === "open" ? null : chip.value })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              !bucket && status === chip.value
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
            placeholder="Search description, contact, equipment, ref…"
            className="pl-8"
          />
        </div>

        {/* Desktop/tablet: filters inline. */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">{fields()}</div>

        {/* Phone: filters collapse into a sheet so they don't eat the first screen (Q-30). */}
        <div className="md:hidden">
          <Button type="button" variant="outline" size="sm" onClick={() => setFiltersOpen(true)} className="gap-1.5">
            <SlidersHorizontal className="size-4" />
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Filters</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3">{fields()}</div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFiltersOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
