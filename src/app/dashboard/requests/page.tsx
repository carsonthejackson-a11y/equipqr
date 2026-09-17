import Link from "next/link";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/company-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { requestReference } from "@/lib/public-request";
import {
  looksLikeRequestReference,
  REQUEST_BUCKETS,
  requestReferenceSearchPrefix,
  type RequestBucketKey,
} from "@/lib/request-queries";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { DISPATCH_STATUS_ORDER } from "@/lib/dispatch";
import { RequestFilters } from "./request-filters";
import { NewRequestSheet } from "./new-request-sheet";
import type {
  CompanyMember,
  Customer,
  Dispatch,
  DispatchStatus,
  Equipment,
  Location,
  RequestPriority,
  RequestStatus,
  ServiceRequest,
  Vendor,
} from "@/lib/types";

const PAGE_SIZE = 50;
const PRIORITY_VALUES: RequestPriority[] = ["low", "normal", "high", "urgent"];

type RequestsSearchParams = {
  status?: string;
  priority?: string;
  assignee?: string;
  q?: string;
  page?: string;
  /** "1" = only requests with at least one customer message (Next roadmap). */
  messages?: string;
  /** Owner-kind only (docs/OWNER-ROADMAP-BRIEF.md §3.2). */
  dispatch?: string;
  /** A REQUEST_BUCKETS key — the Overview's tiles link here so a count and its drill-down list can never disagree (C1-28). Overrides status/priority/assignee/messages/dispatch below when present. */
  bucket?: string;
  /** "visit" sorts by scheduled_for (soonest first, unscheduled last) instead of priority then recency. */
  sort?: string;
};

// PostgREST's `.or()` filter string uses "," to separate clauses and "()" for
// lists — wrapping a value in double quotes lets it contain either literally,
// per https://postgrest.org/en/stable/references/api/tables_views.html#operators.
function escapeOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildParams(params: RequestsSearchParams, overrides: { page?: number; sort?: string | null } = {}): URLSearchParams {
  const usp = new URLSearchParams();
  if (params.bucket) usp.set("bucket", params.bucket);
  if (!params.bucket && params.status) usp.set("status", params.status);
  if (!params.bucket && params.priority) usp.set("priority", params.priority);
  if (!params.bucket && params.assignee) usp.set("assignee", params.assignee);
  if (params.q) usp.set("q", params.q);
  if (!params.bucket && params.messages === "1") usp.set("messages", "1");
  if (!params.bucket && params.dispatch) usp.set("dispatch", params.dispatch);
  const sort = overrides.sort !== undefined ? overrides.sort : params.sort;
  if (sort) usp.set("sort", sort);
  const page = overrides.page ?? 1;
  if (page > 1) usp.set("page", String(page));
  return usp;
}

function buildPageHref(params: RequestsSearchParams, page: number): string {
  const qs = buildParams(params, { page }).toString();
  return `/dashboard/requests${qs ? `?${qs}` : ""}`;
}

/** Toggles the inbox between its default order (priority, then most recent) and soonest-visit-first — always resets to page 1 since the row set at a given page number changes with the sort. */
function buildVisitSortHref(params: RequestsSearchParams): string {
  const nextSort = params.sort === "visit" ? null : "visit";
  const qs = buildParams(params, { page: 1, sort: nextSort }).toString();
  return `/dashboard/requests${qs ? `?${qs}` : ""}`;
}

function isBucketKey(value: string | undefined): value is RequestBucketKey {
  return !!value && Object.hasOwn(REQUEST_BUCKETS, value);
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<RequestsSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const { profile, company, vocab, fmt } = ctx;
  const kind = company.kind;
  const isOwnerKind = kind === "equipment_owner";

  const bucketKey = isBucketKey(params.bucket) ? params.bucket : null;
  const statusParam = params.status ?? "open";
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const sortByVisit = params.sort === "visit";

  const { data: membersData } = await supabase.rpc("get_company_members");
  const members = (membersData as CompanyMember[] | null) ?? [];

  let query = supabase.from("service_requests").select("*", { count: "exact" });

  // `?bucket=` is a fixed predicate (REQUEST_BUCKETS) shared with the
  // Overview's tiles — apply it INSTEAD OF the discrete params below so a
  // bucket link's count and its drill-down list can never drift apart
  // (C1-28; see src/lib/request-queries.ts's own module doc for why).
  if (bucketKey) {
    query = REQUEST_BUCKETS[bucketKey].apply(query);
  } else {
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

    if (params.messages === "1") {
      query = query.not("last_customer_message_at", "is", null);
    }

    if (isOwnerKind && params.dispatch && (DISPATCH_STATUS_ORDER as string[]).includes(params.dispatch)) {
      query = query.eq("dispatch_status", params.dispatch as DispatchStatus);
    }
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
    // Q-07: a customer's quoted reference ("D858-8364") is derived from
    // public_token, but never searched — recognise that shape and OR in a
    // prefix match against the raw token.
    if (looksLikeRequestReference(q)) {
      orClauses.push(`public_token.ilike.${requestReferenceSearchPrefix(q)}%`);
    }
    query = query.or(orClauses.join(","));
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  if (sortByVisit) {
    query = query.order("scheduled_for", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("priority_rank", { ascending: false }).order("created_at", { ascending: false });
  }

  const { data: requests, count } = await query.range(from, to).returns<ServiceRequest[]>();

  const equipmentIds = [...new Set((requests ?? []).map((r) => r.equipment_id))];
  const customerIds = [...new Set((requests ?? []).flatMap((r) => (r.customer_id ? [r.customer_id] : [])))];
  const locationIds = [...new Set((requests ?? []).flatMap((r) => (r.location_id ? [r.location_id] : [])))];
  const dispatchIds = [...new Set((requests ?? []).flatMap((r) => (r.dispatch_id ? [r.dispatch_id] : [])))];

  const [{ data: equipment }, { data: customers }, { data: locations }, { data: dispatches }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, name").in("id", equipmentIds).returns<Pick<Equipment, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Equipment, "id" | "name">[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("id, name").in("id", customerIds).returns<Pick<Customer, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Customer, "id" | "name">[] }),
    isOwnerKind && locationIds.length > 0
      ? supabase.from("locations").select("id, name").in("id", locationIds).returns<Pick<Location, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Location, "id" | "name">[] }),
    isOwnerKind && dispatchIds.length > 0
      ? supabase
          .from("dispatches")
          .select("id, vendor_id, eta_at")
          .in("id", dispatchIds)
          .returns<Pick<Dispatch, "id" | "vendor_id" | "eta_at">[]>()
      : Promise.resolve({ data: [] as Pick<Dispatch, "id" | "vendor_id" | "eta_at">[] }),
  ]);

  const vendorIds = [...new Set((dispatches ?? []).map((d) => d.vendor_id))];
  const { data: vendors } =
    isOwnerKind && vendorIds.length > 0
      ? await supabase.from("vendors").select("id, name").in("id", vendorIds).returns<Pick<Vendor, "id" | "name">[]>()
      : { data: [] as Pick<Vendor, "id" | "name">[] };

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const locationById = new Map((locations ?? []).map((l) => [l.id, l]));
  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v]));
  const dispatchById = new Map((dispatches ?? []).map((d) => [d.id, d]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasAnyFilter = !!(
    bucketKey ||
    (params.status && params.status !== "open") ||
    params.priority ||
    params.assignee ||
    q ||
    params.messages === "1" ||
    params.dispatch
  );

  function problemLine(req: ServiceRequest): string {
    return (req.ai_summary?.trim() || req.description || "").trim();
  }

  function visitLabel(req: ServiceRequest): string {
    if (req.status !== "scheduled" || !req.scheduled_for) return "—";
    return fmt.dateTime(req.scheduled_for);
  }

  function counterpartyName(req: ServiceRequest): string | null {
    if (isOwnerKind) return req.location_id ? (locationById.get(req.location_id)?.name ?? null) : null;
    return req.customer_id ? (customerById.get(req.customer_id)?.name ?? null) : null;
  }

  function counterpartyHref(req: ServiceRequest): string | null {
    if (isOwnerKind) return req.location_id ? `/dashboard/locations/${req.location_id}` : null;
    return req.customer_id ? `/dashboard/customers/${req.customer_id}` : null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{vocab.requestPlural}</h1>
          <p className="text-muted-foreground">
            {isOwnerKind
              ? "Work orders reported from equipment QR codes."
              : "Requests submitted by customers via QR code."}
          </p>
        </div>
        <NewRequestSheet kind={kind} />
      </div>

      <RequestFilters key={params.q ?? ""} members={members ?? []} kind={kind} />

      {!requests || requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          message={
            hasAnyFilter
              ? "No requests match these filters."
              : `No open ${vocab.requestPlural.toLowerCase()} right now. When one comes in — from a scan, a phone call, or a visit — it lands here.`
          }
          action={
            hasAnyFilter ? (
              <Button variant="outline" render={<Link href="/dashboard/requests" />}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Phone: cards, not a sideways-scrolling table (Q-30). */}
          <div className="space-y-2 md:hidden">
            {requests.map((req) => {
              const unitName = equipmentById.get(req.equipment_id)?.name ?? "Unknown equipment";
              const problem = problemLine(req);
              const assigneeName = req.assigned_to ? memberById.get(req.assigned_to)?.full_name : null;
              return (
                <Link
                  key={req.id}
                  href={`/dashboard/requests/${req.id}`}
                  className="block rounded-lg border bg-card p-3 active:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={req.priority} />
                      <StatusBadge status={req.status} />
                    </div>
                    {req.unread_customer_messages > 0 && (
                      <Badge className="h-5 shrink-0 rounded-full bg-sky-500/15 px-1.5 text-[10px] text-sky-700 dark:text-sky-400">
                        {req.unread_customer_messages} new
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1.5 font-medium">{unitName}</p>
                  {problem && <p className="line-clamp-2 text-sm text-muted-foreground">{problem}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {counterpartyName(req) && <>{counterpartyName(req)} · </>}
                    {formatRelativeTime(req.created_at)}
                    {assigneeName && <> · {assigneeName.split(" ")[0]}</>}
                    {req.status === "scheduled" && req.scheduled_for && <> · Visit {visitLabel(req)}</>}
                  </p>
                </Link>
              );
            })}
          </div>

          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>{isOwnerKind ? "Location" : "Customer"}</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>
                    <Link href={buildVisitSortHref(params)} className="hover:underline" title="Sort by soonest visit">
                      Visit{sortByVisit ? " ↓" : ""}
                    </Link>
                  </TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  {isOwnerKind && <TableHead>Dispatch</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => {
                  const unitName = equipmentById.get(req.equipment_id)?.name ?? "Unknown equipment";
                  const problem = problemLine(req);
                  const cpName = counterpartyName(req);
                  const cpHref = counterpartyHref(req);
                  return (
                    <TableRow key={req.id} className="relative">
                      <TableCell>
                        <PriorityBadge priority={req.priority} />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/requests/${req.id}`}
                          className="static inline-flex items-center gap-2 font-medium after:absolute after:inset-0 hover:underline"
                        >
                          {unitName}
                          {req.unread_customer_messages > 0 && (
                            <Badge className="relative z-10 h-5 shrink-0 rounded-full bg-sky-500/15 px-1.5 text-[10px] text-sky-700 dark:text-sky-400">
                              {req.unread_customer_messages} new
                            </Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[24ch]">
                        {problem && <p className="truncate text-sm">{problem}</p>}
                        <p className="truncate text-xs text-muted-foreground">Ref {requestReference(req.public_token)}</p>
                      </TableCell>
                      <TableCell>
                        {cpHref ? (
                          <Link href={cpHref} className="relative z-10 hover:underline">
                            {cpName ?? "—"}
                          </Link>
                        ) : (
                          (cpName ?? "—")
                        )}
                      </TableCell>
                      <TableCell>
                        {req.assigned_to ? (
                          memberById.get(req.assigned_to)?.full_name ?? "—"
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{visitLabel(req)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(req.created_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={req.status} />
                      </TableCell>
                      {isOwnerKind && (
                        <TableCell>
                          <DispatchStatusBadge
                            status={req.dispatch_status}
                            vendorName={
                              req.dispatch_id
                                ? (vendorById.get(dispatchById.get(req.dispatch_id)?.vendor_id ?? "")?.name ?? null)
                                : null
                            }
                            etaAt={req.dispatch_id ? (dispatchById.get(req.dispatch_id)?.eta_at ?? null) : null}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
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
