import Link from "next/link";
import { AlertTriangle, CalendarRange, HardHat, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { EquipmentStatusBadge } from "@/components/status-badge";
import { NewEquipmentDialog } from "./new-equipment-dialog";
import { EquipmentFilters } from "./equipment-filters";
import type { Customer, Equipment, EquipmentCustomField, EquipmentType } from "@/lib/types";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import { formatRelativeTime } from "@/lib/format";
import {
  PM_DUE_SOON_DAYS,
  WARRANTY_SOON_DAYS,
  isEquipmentStatus,
  pmState,
  warrantyState,
} from "@/lib/equipment";
import { isPmFilter, pmFilterRange } from "@/lib/pm-reminders";
import { getCurrentProfile } from "@/lib/auth";

/** Rows per page. Big enough that most companies never paginate, small enough to stay fast. */
const PAGE_SIZE = 50;

/** Columns the free-text search looks at. */
const SEARCH_COLUMNS = ["name", "serial_number", "make", "model", "location"];

/**
 * PostgREST's `or=` takes a comma-separated list, so a raw comma or paren in
 * the term would change the meaning of the filter. Strip everything that has
 * syntax value there (and the LIKE wildcards) rather than trying to quote it.
 */
function searchFilter(term: string): string {
  const safe = term.replace(/[,()%*\\"']/g, " ").trim();
  if (!safe) return "";
  return SEARCH_COLUMNS.map((column) => `${column}.ilike.%${safe}%`).join(",");
}

function pageHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page <= 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }
  const search = next.toString();
  return search ? `/dashboard/equipment?${search}` : "/dashboard/equipment";
}

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    customer?: string;
    status?: string;
    pm?: string;
    page?: string;
  }>;
}) {
  const raw = await searchParams;
  const q = (raw.q ?? "").trim();
  const typeFilter = raw.type && raw.type !== "all" ? raw.type : "";
  const customerFilter = raw.customer && raw.customer !== "all" ? raw.customer : "";
  const statusFilter = raw.status && isEquipmentStatus(raw.status) ? raw.status : "";
  const pmFilter = isPmFilter(raw.pm) && raw.pm !== "any" ? raw.pm : "";
  const pmRange = pmFilterRange(pmFilter);
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const supabase = await createClient();

  let query = supabase
    .from("equipment")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const orFilter = q ? searchFilter(q) : "";
  if (orFilter) query = query.or(orFilter);
  if (typeFilter) query = query.eq("equipment_type_id", typeFilter);
  if (customerFilter) query = query.eq("customer_id", customerFilter);
  if (statusFilter) query = query.eq("status", statusFilter);
  // The maintenance window is a date comparison in SQL (a lte/gte on the
  // indexed column), never a scan of the page in TS — see pmFilterRange().
  // The overview card excludes retired units from its counts; the list it
  // links to has to agree, or "3 overdue" opens a page with four rows.
  if (pmFilter && pmFilter !== "none" && !statusFilter) query = query.neq("status", "retired");
  if (pmRange?.isNull) query = query.is("next_service_due_on", null);
  if (pmRange?.lte) query = query.lte("next_service_due_on", pmRange.lte);
  if (pmRange?.gte) query = query.gte("next_service_due_on", pmRange.gte);

  const [
    { data: equipment, count },
    { data: equipmentTypes },
    { data: customers },
    { data: customFields },
    entitlements,
    { profile },
  ] = await Promise.all([
    query.returns<Equipment[]>(),
    supabase.from("equipment_types").select("*").order("name").returns<EquipmentType[]>(),
    supabase.from("customers").select("*").order("name").returns<Customer[]>(),
    supabase
      .from("equipment_custom_fields")
      .select("*")
      .order("sort_order")
      .order("created_at")
      .returns<EquipmentCustomField[]>(),
    getEntitlements(),
    getCurrentProfile(),
  ]);

  const batchQrEnabled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");
  const typeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(q || typeFilter || customerFilter || statusFilter || pmFilter);
  const noTypes = !equipmentTypes || equipmentTypes.length === 0;

  const currentParams = new URLSearchParams();
  if (q) currentParams.set("q", q);
  if (typeFilter) currentParams.set("type", typeFilter);
  if (customerFilter) currentParams.set("customer", customerFilter);
  if (statusFilter) currentParams.set("status", statusFilter);
  if (pmFilter) currentParams.set("pm", pmFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Equipment</h1>
          <p className="text-muted-foreground">
            Physical units in the field, each with its own QR code.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            render={<Link href="/dashboard/equipment/labels" />}
            nativeButton={false}
            variant="outline"
          >
            Label sheets
          </Button>
          {profile.role === "owner" && (
            <Button variant="outline" nativeButton={false} render={<Link href="/dashboard/equipment/import" />}>
              <Upload className="size-4" />
              Import CSV
            </Button>
          )}
          <NewEquipmentDialog
            equipmentTypes={equipmentTypes ?? []}
            customers={customers ?? []}
            customFields={customFields ?? []}
            batchQrEnabled={batchQrEnabled}
          />
        </div>
      </div>

      {noTypes ? (
        <EmptyState icon={HardHat} message="Create an equipment type first, then add equipment here." />
      ) : (
        <>
          <EquipmentFilters
            values={{ q, type: typeFilter, customer: customerFilter, status: statusFilter, pm: pmFilter }}
            equipmentTypes={equipmentTypes ?? []}
            customers={customers ?? []}
          />

          {!equipment || equipment.length === 0 ? (
            <EmptyState
              icon={HardHat}
              message={
                hasFilters
                  ? "No equipment matches those filters."
                  : "No equipment yet. Add your first unit to generate its QR code."
              }
            />
          ) : (
            <>
              <Card className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Make / model</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Last serviced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipment.map((item) => {
                      const warranty = warrantyState(item.warranty_ends_on);
                      const pm = pmState(item.next_service_due_on);
                      const makeModel = [item.make, item.model].filter(Boolean).join(" ");

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Link
                              href={`/dashboard/equipment/${item.id}`}
                              className="font-medium hover:underline"
                            >
                              {item.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {typeById.get(item.equipment_type_id)?.name ?? "—"}
                              {item.serial_number && ` · S/N ${item.serial_number}`}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <EquipmentStatusBadge status={item.status} />
                              {(warranty.state === "soon" || warranty.state === "expired") && (
                                <span
                                  className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
                                  title={
                                    warranty.state === "expired"
                                      ? `Warranty expired ${warranty.days} days ago`
                                      : `Warranty expires in ${warranty.days} days`
                                  }
                                >
                                  <AlertTriangle className="size-3.5" />
                                  {warranty.state === "expired"
                                    ? "Warranty expired"
                                    : `Warranty ≤${WARRANTY_SOON_DAYS}d`}
                                </span>
                              )}
                              {(pm.state === "overdue" || pm.state === "due_soon") && (
                                <span
                                  className={
                                    pm.state === "overdue"
                                      ? "inline-flex items-center gap-1 text-xs text-destructive"
                                      : "inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
                                  }
                                  title={
                                    pm.state === "overdue"
                                      ? `Service overdue by ${pm.days} days (due ${item.next_service_due_on})`
                                      : `Service due in ${pm.days} days (${item.next_service_due_on})`
                                  }
                                >
                                  <CalendarRange className="size-3.5" />
                                  {pm.state === "overdue" ? "Service overdue" : `Service ≤${PM_DUE_SOON_DAYS}d`}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{makeModel || "—"}</TableCell>
                          <TableCell>
                            {item.customer_id ? customerById.get(item.customer_id)?.name ?? "—" : "—"}
                          </TableCell>
                          <TableCell>{item.location ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.last_serviced_at ? formatRelativeTime(item.last_serviced_at) : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {total} {total === 1 ? "unit" : "units"}
                  {totalPages > 1 && ` · page ${page} of ${totalPages}`}
                </span>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    {/* Rendered as links only when they go somewhere — a `disabled`
                        anchor would still navigate on click. */}
                    {page > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={pageHref(currentParams, page - 1)} />}
                      >
                        Previous
                      </Button>
                    )}
                    {page < totalPages && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<Link href={pageHref(currentParams, page + 1)} />}
                      >
                        Next
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
