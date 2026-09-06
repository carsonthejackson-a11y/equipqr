import Link from "next/link";
import { Inbox, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  StatusBadge,
  PriorityBadge,
  OPEN_REQUEST_STATUSES,
  CLOSED_REQUEST_STATUSES,
} from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatRelativeTime } from "@/lib/format";
import { formatZonedDate, isPastVisit, isValidTimeZone } from "@/lib/scheduling";
import { cn } from "@/lib/utils";
import { RequestFilters } from "./request-filters";
import { hasUnreadCustomerMessage } from "./unread";
import type { CompanyMember, Customer, Equipment, RequestPriority, RequestStatus, ServiceRequest } from "@/lib/types";

const PAGE_SIZE = 50;
const PRIORITY_VALUES: RequestPriority[] = ["low", "normal", "high", "urgent"];

type RequestsSearchParams = {
  status?: string;
  priority?: string;
  assignee?: string;
  q?: string;
  page?: string;
  /** "1" = only requests the customer has replied on (see hasUnreadCustomerMessage for the unread dot). */
  replied?: string;
};

/** "2:30 PM" in the company zone — pairs with formatZonedDate() for the Visit column. */
function formatZonedTimeShort(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}

// PostgREST's `.or()` filter string uses "," to separate clauses and "()" for
// lists — wrapping a value in double quotes lets it contain either literally,
// per https://postgrest.org/en/stable/references/api/tables_views.html#operators.
function escapeOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildPageHref(params: RequestsSearchParams, page: number): string {
  const usp = new URLSearchParams();
  if (params.status) usp.set("status", params.status);
  if (params.priority) usp.set("priority", params.priority);
  if (params.assignee) usp.set("assignee", params.assignee);
  if (params.q) usp.set("q", params.q);
  if (params.replied === "1") usp.set("replied", "1");
  if (page > 1) usp.set("page", String(page));
  const qs = usp.toString();
  return `/dashboard/requests${qs ? `?${qs}` : ""}`;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<RequestsSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();
  const timezone = company.timezone;

  const statusParam = params.status ?? "open";
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const { data: membersData } = await supabase.rpc("get_company_members");
  const members = (membersData as CompanyMember[] | null) ?? [];

  let query = supabase.from("service_requests").select("*", { count: "exact" });

  if (statusParam === "closed") {
    query = query.in("status", CLOSED_REQUEST_STATUSES);
  } else if ((OPEN_REQUEST_STATUSES as string[]).includes(statusParam)) {
    query = query.eq("status", statusParam as RequestStatus);
  } else {
    // "open" (the default) and any unrecognised value both fall back to the
    // open set, rather than silently showing every request ever submitted.
    query = query.in("status", OPEN_REQUEST_STATUSES);
  }

  if (params.priority && (PRIORITY_VALUES as string[]).includes(params.priority)) {
    query = query.eq("priority", params.priority as RequestPriority);
  }

  if (params.assignee === "me") {
    query = query.eq("assigned_to", profile.id);
  } else if (params.assignee === "unassigned") {
    query = query.is("assigned_to", null);
  } else if (params.assignee) {
    query = query.eq("assigned_to", params.assignee);
  }

  // PostgREST can't compare two columns of one row, so "has replied" is the
  // server-side filter and "unread" (newer than customer_messages_read_at) is
  // computed per row in TS for the indicator below.
  if (params.replied === "1") {
    query = query.not("last_customer_message_at", "is", null);
  }

  if (q) {
    const { data: matchedEquipment } = await supabase.from("equipment").select("id").ilike("name", `%${q}%`);
    const equipmentIds = (matchedEquipment ?? []).map((e) => e.id);

    const orClauses = [
      `description.ilike.${escapeOrValue(`%${q}%`)}`,
      `contact_name.ilike.${escapeOrValue(`%${q}%`)}`,
      `contact_email.ilike.${escapeOrValue(`%${q}%`)}`,
      `contact_phone.ilike.${escapeOrValue(`%${q}%`)}`,
    ];
    if (equipmentIds.length > 0) {
      orClauses.push(`equipment_id.in.(${equipmentIds.join(",")})`);
    }
    query = query.or(orClauses.join(","));
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // The Scheduled view is a calendar, not a triage list: soonest visit first.
  const ordered =
    statusParam === "scheduled"
      ? query.order("scheduled_for", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
      : query.order("priority_rank", { ascending: false }).order("created_at", { ascending: false });

  const { data: requests, count } = await ordered.range(from, to).returns<ServiceRequest[]>();

  const equipmentIds = [...new Set((requests ?? []).map((r) => r.equipment_id))];
  const customerIds = [...new Set((requests ?? []).flatMap((r) => (r.customer_id ? [r.customer_id] : [])))];

  const [{ data: equipment }, { data: customers }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, name").in("id", equipmentIds).returns<Pick<Equipment, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Equipment, "id" | "name">[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", customerIds).returns<Pick<Customer, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Customer, "id" | "name">[] }),
  ]);

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Service requests</h1>
        <p className="text-muted-foreground">Requests submitted by customers via QR code.</p>
      </div>

      <RequestFilters key={params.q ?? ""} members={members ?? []} />

      {!requests || requests.length === 0 ? (
        <EmptyState icon={Inbox} message="No requests match these filters." />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Visit</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <PriorityBadge priority={req.priority} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/dashboard/requests/${req.id}`} className="font-medium hover:underline">
                          {equipmentById.get(req.equipment_id)?.name ?? "Unknown equipment"}
                        </Link>
                        {hasUnreadCustomerMessage(req) && (
                          <span
                            title="New customer reply"
                            aria-label="New customer reply"
                            className="relative inline-flex shrink-0 text-primary"
                          >
                            <MessageSquare className="size-3.5" />
                            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {req.customer_id ? (
                        <Link href={`/dashboard/customers/${req.customer_id}`} className="hover:underline">
                          {customerById.get(req.customer_id)?.name ?? "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p>{req.contact_name}</p>
                        {req.contact_email && (
                          <p className="text-xs text-muted-foreground">{req.contact_email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {req.assigned_to ? (
                        memberById.get(req.assigned_to)?.full_name ?? "—"
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {req.scheduled_for ? (
                        <span
                          className={cn(
                            "text-sm whitespace-nowrap",
                            isPastVisit(req.scheduled_for) && "text-muted-foreground line-through"
                          )}
                        >
                          {formatZonedDate(req.scheduled_for, timezone)}{" "}
                          <span className="text-muted-foreground">{formatZonedTimeShort(req.scheduled_for, timezone)}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatRelativeTime(req.created_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              {total} request{total === 1 ? "" : "s"}
              {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
            </p>
            {totalPages > 1 && (
              <div className="flex gap-3">
                {page > 1 ? (
                  <Link href={buildPageHref(params, page - 1)} className="hover:text-foreground hover:underline">
                    Previous
                  </Link>
                ) : (
                  <span className="opacity-50">Previous</span>
                )}
                {page < totalPages ? (
                  <Link href={buildPageHref(params, page + 1)} className="hover:text-foreground hover:underline">
                    Next
                  </Link>
                ) : (
                  <span className="opacity-50">Next</span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
