import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, HardHat, ShieldCheck, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type {
  CategoryDefaultVendor,
  Customer,
  Equipment,
  EquipmentCustomField,
  EquipmentType,
  Location,
  Vendor,
} from "@/lib/types";
import { getEntitlements, hasFeature, planFor } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import { formatRelativeTime } from "@/lib/format";
import { WARRANTY_SOON_DAYS, isEquipmentStatus, warrantyState } from "@/lib/equipment";
import { getCurrentProfile } from "@/lib/auth";
import { nextPlanUp, usageMetricsFor } from "@/lib/plan-usage";

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

/**
 * A sticker's short code is stored undashed ("AB3D9F2K" — see
 * supabase/migrations/0013_now_roadmap_foundation.sql), but it's always
 * *displayed* with a dash ("AB3D-9F2K"), so someone searching by a code read
 * off a physical sticker will very likely type the dash. Strip everything
 * but letters/digits so both forms match the stored column
 * (docs/QOL-CONTINUITY-BRIEF.md item 11 / Q-31).
 */
function shortCodeSearchTerm(term: string): string {
  return term.replace(/[^a-zA-Z0-9]/g, "");
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
    location?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const raw = await searchParams;
  const q = (raw.q ?? "").trim();
  const typeFilter = raw.type && raw.type !== "all" ? raw.type : "";
  const customerFilter = raw.customer && raw.customer !== "all" ? raw.customer : "";
  const locationFilter = raw.location && raw.location !== "all" ? raw.location : "";
  const statusFilter = raw.status && isEquipmentStatus(raw.status) ? raw.status : "";
  const page = Math.max(1, Number.parseInt(raw.page ?? "1", 10) || 1);

  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();
  const isOwnerKind = company.kind === "equipment_owner";

  let query = supabase
    .from("equipment")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // Search also matches a sticker's short code (item 11 / Q-31) — someone
  // standing at a unit can search what's printed on it. qr_codes has its own
  // RLS ("Staff view own company qr codes"), so this needs no company filter.
  const codeTerm = q ? shortCodeSearchTerm(q) : "";
  const matchingCodeEquipmentIds: string[] = [];
  // At least 4 characters (half a printed code) and at most 50 matches: a
  // one-character term would otherwise match a large share of a big
  // account's codes and turn into an or=() filter too long for the gateway.
  if (codeTerm.length >= 4) {
    const { data: matchingCodes } = await supabase
      .from("qr_codes")
      .select("equipment_id")
      .ilike("short_code", `%${codeTerm}%`)
      .not("equipment_id", "is", null)
      .limit(50)
      .returns<{ equipment_id: string | null }[]>();
    for (const code of matchingCodes ?? []) {
      if (code.equipment_id) matchingCodeEquipmentIds.push(code.equipment_id);
    }
  }

  const orFilter = q ? searchFilter(q) : "";
  const combinedFilter = [orFilter, ...matchingCodeEquipmentIds.map((id) => `id.eq.${id}`)]
    .filter(Boolean)
    .join(",");
  if (combinedFilter) query = query.or(combinedFilter);
  if (typeFilter) query = query.eq("equipment_type_id", typeFilter);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (isOwnerKind) {
    if (locationFilter) query = query.eq("location_id", locationFilter);
  } else if (customerFilter) {
    query = query.eq("customer_id", customerFilter);
  }

  const [
    { data: equipment, count },
    { data: equipmentTypes },
    { data: customers },
    { data: customFields },
    entitlements,
    { data: locations },
    { data: vendors },
    { data: categoryDefaultVendors },
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
    isOwnerKind
      ? supabase.from("locations").select("*").eq("active", true).order("name").returns<Location[]>()
      : Promise.resolve({ data: [] as Location[] }),
    isOwnerKind
      ? supabase.from("vendors").select("*").eq("active", true).order("name").returns<Vendor[]>()
      : Promise.resolve({ data: [] as Vendor[] }),
    isOwnerKind
      ? supabase.from("category_default_vendors").select("*").returns<CategoryDefaultVendor[]>()
      : Promise.resolve({ data: [] as CategoryDefaultVendor[] }),
  ]);

  const batchQrEnabled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");
  // Limits visible before work (docs/QOL-CONTINUITY-BRIEF.md item 6): an
  // at-limit banner here, before anyone fills out the New equipment form
  // only to hit assertCanAddEquipment()'s error on submit.
  const plan = entitlements ? planFor(entitlements) : null;
  const equipmentUsage =
    entitlements && plan
      ? usageMetricsFor({
          kind: company.kind,
          equipmentCount: entitlements.equipment_count,
          memberCount: entitlements.member_count,
          locationCount: entitlements.location_count,
          plan,
        }).find((s) => s.key === "equipment")
      : undefined;
  const upgradeTarget = plan ? nextPlanUp(company.kind, plan.id) : null;
  const typeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const locationById = new Map((locations ?? []).map((l) => [l.id, l]));
  const vendorById = new Map((vendors ?? []).map((v) => [v.id, v]));
  const categoryDefaultVendorByType = new Map((categoryDefaultVendors ?? []).map((cd) => [cd.equipment_type_id, cd.vendor_id]));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(q || typeFilter || customerFilter || locationFilter || statusFilter);

  const currentParams = new URLSearchParams();
  if (q) currentParams.set("q", q);
  if (typeFilter) currentParams.set("type", typeFilter);
  if (customerFilter) currentParams.set("customer", customerFilter);
  if (locationFilter) currentParams.set("location", locationFilter);
  if (statusFilter) currentParams.set("status", statusFilter);

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
          <Suspense fallback={<Button disabled>New equipment</Button>}>
            <NewEquipmentDialog
              equipmentTypes={equipmentTypes ?? []}
              customers={customers ?? []}
              customFields={customFields ?? []}
              batchQrEnabled={batchQrEnabled}
              kind={company.kind}
              locations={locations ?? []}
              vendors={vendors ?? []}
              categoryDefaultVendors={categoryDefaultVendors ?? []}
            />
          </Suspense>
        </div>
      </div>

      {equipmentUsage?.atLimit && (
        <Alert variant="destructive">
          <AlertTitle>
            You&apos;ve reached the {equipmentUsage.limit}-unit limit of the {plan?.name} plan
          </AlertTitle>
          <AlertDescription>
            {profile.role === "owner" ? (
              <>
                {upgradeTarget &&
                  `Upgrade to ${upgradeTarget.name} for up to ${upgradeTarget.equipmentLimit} units. `}
                <Link href="/dashboard/settings/billing">
                  {upgradeTarget ? "View plans" : "Manage billing"}
                </Link>
              </>
            ) : (
              "Ask your account owner to upgrade the plan to add more equipment."
            )}
          </AlertDescription>
        </Alert>
      )}

      <EquipmentFilters
        values={{ q, type: typeFilter, customer: customerFilter, location: locationFilter, status: statusFilter }}
        equipmentTypes={equipmentTypes ?? []}
        customers={customers ?? []}
        kind={company.kind}
        locations={locations ?? []}
      />

      {!equipment || equipment.length === 0 ? (
        <EmptyState
          icon={HardHat}
          message={
            hasFilters
              ? "No equipment matches those filters."
              : "No equipment yet. Add your first unit to generate its QR code."
          }
          action={
            !hasFilters ? (
              <Button render={<Link href="/dashboard/equipment?new=1" />} nativeButton={false}>
                Add your first unit
              </Button>
            ) : undefined
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
                      <TableHead>{isOwnerKind ? "Location" : "Customer"}</TableHead>
                      <TableHead>{isOwnerKind ? "Area" : "Location"}</TableHead>
                      {isOwnerKind && <TableHead>Vendor</TableHead>}
                      <TableHead>Last serviced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equipment.map((item) => {
                      const warranty = warrantyState(item.warranty_ends_on);
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
                            {/* Warranty badge rule (docs/QOL-CONTINUITY-BRIEF.md §2 / Q-41):
                                a badge only for "in warranty" (neutral/green) and "ends
                                soon" (amber, within WARRANTY_SOON_DAYS). An expired
                                warranty gets no list badge — that's normal, not alarming,
                                and the detail page says so in neutral text instead. */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <EquipmentStatusBadge status={item.status} />
                              {warranty.state === "active" && (
                                <span
                                  className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"
                                  title="Warranty active"
                                >
                                  <ShieldCheck className="size-3.5" />
                                  In warranty
                                </span>
                              )}
                              {warranty.state === "soon" && (
                                <span
                                  className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"
                                  title={`Warranty expires in ${warranty.days} days`}
                                >
                                  <AlertTriangle className="size-3.5" />
                                  Warranty ends ≤{WARRANTY_SOON_DAYS}d
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{makeModel || "—"}</TableCell>
                          <TableCell>
                            {isOwnerKind
                              ? item.location_id
                                ? (locationById.get(item.location_id)?.name ?? "—")
                                : "—"
                              : item.customer_id
                                ? (customerById.get(item.customer_id)?.name ?? "—")
                                : "—"}
                          </TableCell>
                          <TableCell>{item.location ?? "—"}</TableCell>
                          {isOwnerKind && (
                            <TableCell>
                              {item.vendor_id ? (
                                vendorById.get(item.vendor_id)?.name ?? "—"
                              ) : (
                                (() => {
                                  const defaultVendorId = categoryDefaultVendorByType.get(item.equipment_type_id);
                                  const defaultVendor = defaultVendorId ? vendorById.get(defaultVendorId) : undefined;
                                  return (
                                    <span className="text-muted-foreground">
                                      {defaultVendor ? `${defaultVendor.name} (default)` : "No vendor"}
                                    </span>
                                  );
                                })()
                              )}
                            </TableCell>
                          )}
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
    </div>
  );
}
