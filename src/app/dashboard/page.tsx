import Link from "next/link";
import { QrCode, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, planFor, type Entitlements } from "@/lib/billing";
import type { Plan } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import { formatRelativeTime } from "@/lib/format";
import { GettingStartedChecklist, type ChecklistItem } from "./getting-started-checklist";
import { requiredChecklistItemsDone } from "@/lib/onboarding-checklist";
import { anyNearLimit, usageMetricsFor } from "@/lib/plan-usage";
import { vocabFor } from "@/lib/vocab";
import type { Equipment, ServiceRequest } from "@/lib/types";

type MonthlyRequestRow = { created_at: string; resolved_at: string | null };

// Plain helper (not the component body) so the `new Date()`/`Date.now()`
// calls stay out of the render function's own body — react-hooks' purity
// rule flags an impure call written directly inside a component, but not
// one made from a called-out function like this (same pattern as
// `daysUntil()` in dashboard/layout.tsx and `daysLeft()` on the billing
// page).
function getDateWindows() {
  const now = new Date();
  return {
    sixtyDaysAgoIso: new Date(now.getTime() - 60 * 86_400_000).toISOString(),
    thirtyDaysAgoIso: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    startOfThisMonth: new Date(now.getFullYear(), now.getMonth(), 1),
    startOfLastMonth: new Date(now.getFullYear(), now.getMonth() - 1, 1),
  };
}

function buildUsageLine(entitlements: Entitlements, plan: Plan): string {
  const base = `${entitlements.equipment_count} of ${plan.equipmentLimit} units on ${plan.name}`;

  if (entitlements.is_trialing && entitlements.trial_ends_at) {
    const days = Math.max(
      0,
      Math.ceil((new Date(entitlements.trial_ends_at).getTime() - Date.now()) / 86_400_000)
    );
    return `${base} · trial ends in ${days} day${days === 1 ? "" : "s"}`;
  }

  if (entitlements.status === "active" && entitlements.current_period_end) {
    return `${base} · renews ${new Date(entitlements.current_period_end).toLocaleDateString()}`;
  }

  return base;
}

export default async function DashboardOverviewPage() {
  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();
  const isOwnerKind = company.kind === "equipment_owner";
  const vocab = vocabFor(company.kind);

  const { sixtyDaysAgoIso, thirtyDaysAgoIso, startOfThisMonth, startOfLastMonth } = getDateWindows();

  const [
    { count: equipmentCount },
    { count: typeCount },
    { count: openRequestCount },
    { count: unassignedOpenCount },
    { count: urgentOpenCount },
    { count: unreadMessagesCount },
    { count: customerCount },
    { count: scanCount },
    { count: guideStepCount },
    { data: recentRequests },
    { data: monthlyRequests },
    entitlements,
    { count: locationCount },
    { count: vendorCount },
    // "No vendor response yet" mirrors the cron's own eligibility set
    // (docs/OWNER-ROADMAP-BRIEF.md §2.2 dispatch_sla_check: status in
    // ('sent', 'viewed')) — sent to the vendor but not yet acknowledged.
    { count: noVendorResponseCount },
    // Truthful "printed" for the checklist (item 4): having a code LINKED to
    // a unit isn't "printed" — qr_codes.label_printed_at is only set once the
    // Print button, or a PNG/SVG download, actually fires (label/print-button.tsx,
    // equipment/[id]/qr/{png,svg}/route.ts).
    { count: printedQrCount },
    // All-time, unlike the 30-day scanCount stat card above — a checklist
    // item should stay "done" once true, not flip back off after a month.
    { count: everScannedCount },
  ] = await Promise.all([
    supabase.from("equipment").select("*", { count: "exact", head: true }),
    supabase.from("equipment_types").select("*", { count: "exact", head: true }),
    supabase
      .from("service_requests")
      .select("*", { count: "exact", head: true })
      .in("status", OPEN_REQUEST_STATUSES),
    supabase
      .from("service_requests")
      .select("*", { count: "exact", head: true })
      .in("status", OPEN_REQUEST_STATUSES)
      .is("assigned_to", null),
    supabase
      .from("service_requests")
      .select("*", { count: "exact", head: true })
      .in("status", OPEN_REQUEST_STATUSES)
      .in("priority", ["high", "urgent"]),
    // Next roadmap: two-way messaging unread counter (migration 0019).
    supabase
      .from("service_requests")
      .select("*", { count: "exact", head: true })
      .gt("unread_customer_messages", 0),
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("scan_events").select("*", { count: "exact", head: true }).gte("scanned_at", thirtyDaysAgoIso),
    supabase.from("guide_steps").select("*", { count: "exact", head: true }),
    supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<ServiceRequest[]>(),
    supabase
      .from("service_requests")
      .select("created_at, resolved_at")
      .gte("created_at", sixtyDaysAgoIso)
      .returns<MonthlyRequestRow[]>(),
    getEntitlements(),
    supabase.from("locations").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("vendors").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("service_requests").select("*", { count: "exact", head: true }).in("dispatch_status", ["sent", "viewed"]),
    supabase
      .from("qr_codes")
      .select("*", { count: "exact", head: true })
      .not("equipment_id", "is", null)
      .not("label_printed_at", "is", null),
    supabase.from("scan_events").select("*", { count: "exact", head: true }),
  ]);

  const recentEquipmentIds = [...new Set((recentRequests ?? []).map((r) => r.equipment_id))];
  const { data: recentEquipment } =
    recentEquipmentIds.length > 0
      ? await supabase
          .from("equipment")
          .select("id, name")
          .in("id", recentEquipmentIds)
          .returns<Pick<Equipment, "id" | "name">[]>()
      : { data: [] as Pick<Equipment, "id" | "name">[] };
  const equipmentNameById = new Map((recentEquipment ?? []).map((e) => [e.id, e.name]));

  // "This month" / "last month" / "resolved this month", counted in TS from
  // a single 60-day fetch rather than a dedicated RPC.
  let requestsThisMonth = 0;
  let requestsLastMonth = 0;
  let resolvedThisMonth = 0;
  for (const r of monthlyRequests ?? []) {
    const created = new Date(r.created_at);
    if (created >= startOfThisMonth) requestsThisMonth++;
    else if (created >= startOfLastMonth) requestsLastMonth++;
    if (r.resolved_at && new Date(r.resolved_at) >= startOfThisMonth) resolvedThisMonth++;
  }

  const memberCount = entitlements?.member_count ?? 1;
  const hasEquipment = (equipmentCount ?? 0) > 0;
  const checklistItems: ChecklistItem[] = [
    {
      key: "type",
      label: "Create an equipment type",
      href: "/dashboard/equipment-types?new=1",
      done: (typeCount ?? 0) > 0,
    },
    {
      key: "guide",
      label: "Add a troubleshooting guide",
      href: "/dashboard/equipment-types",
      done: (guideStepCount ?? 0) > 0,
    },
    {
      key: "equipment",
      label: "Add your first equipment",
      href: "/dashboard/equipment?new=1",
      done: hasEquipment,
    },
    {
      key: "qr",
      // Truthful: a code merely being linked to a unit used to count here —
      // now it takes an actual Print click or PNG/SVG download to check this
      // off (label_printed_at), matching what the labels page itself shows.
      label: "Print or download a QR label",
      href: "/dashboard/equipment",
      done: (printedQrCount ?? 0) > 0,
    },
    {
      key: "scan",
      label: "Scan your sticker with your phone",
      href: "/dashboard/equipment",
      done: (everScannedCount ?? 0) > 0,
    },
    {
      key: "phone",
      // vocab-aware: the sticker's "Call {phone}" line is read by whoever
      // scans it — a customer for a provider, a staff member for an owner.
      label: `Add the phone number ${vocab.reporterNoun.toLowerCase()}s can call`,
      href: "/dashboard/settings",
      done: !!company.phone,
    },
    {
      key: "invite",
      label: "Invite a teammate",
      href: "/dashboard/settings/team",
      done: memberCount > 1,
      optional: true,
    },
  ];
  const showChecklist =
    !company.onboarding_dismissed_at && !requiredChecklistItemsDone(checklistItems);

  const plan = entitlements ? planFor(entitlements) : null;
  const usageLine = entitlements && plan ? buildUsageLine(entitlements, plan) : null;
  // Limits visible before work (docs/QOL-CONTINUITY-BRIEF.md item 6): a
  // usage card once any tracked metric crosses 80% of its plan limit, so
  // growth toward a limit is visible well before the at-limit banners
  // (equipment/locations pages) or assertCanAdd*()'s hard block kick in.
  const usageStats =
    entitlements && plan
      ? usageMetricsFor({
          kind: company.kind,
          equipmentCount: entitlements.equipment_count,
          memberCount: entitlements.member_count,
          locationCount: entitlements.location_count,
          plan,
        })
      : [];
  const showUsageCard = anyNearLimit(usageStats);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">A quick snapshot of your account.</p>
        {usageLine && <p className="mt-1 text-sm text-muted-foreground">{usageLine}</p>}
      </div>

      {showUsageCard && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">Approaching your plan limit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageStats
              .filter((stat) => stat.nearLimit)
              .map((stat) => (
                <div key={stat.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {stat.count} of {stat.limit} {stat.label}
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round((stat.pct ?? 0) * 100)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (stat.pct ?? 0) * 100)}
                    indicatorClassName={stat.atLimit ? "bg-destructive" : "bg-amber-500"}
                  />
                </div>
              ))}
            {profile.role === "owner" ? (
              <Button size="sm" render={<Link href="/dashboard/settings/billing" />} nativeButton={false}>
                View plans
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Ask your account owner to upgrade the plan.</p>
            )}
          </CardContent>
        </Card>
      )}

      {!hasEquipment && !company.onboarding_dismissed_at && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <QrCode className="size-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Get your first sticker live</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Three steps and a customer can scan a real sticker: add a unit, print its label,
                then scan it yourself to see exactly what they&apos;ll see.
              </p>
            </div>
            <ol className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6">
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  1
                </span>
                Add a unit
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  2
                </span>
                Print its sticker
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  3
                </span>
                Scan it with your phone
              </li>
            </ol>
            <Button render={<Link href="/dashboard/equipment?new=1" />} nativeButton={false} size="lg">
              Add your first unit
            </Button>
          </CardContent>
        </Card>
      )}

      {isOwnerKind ? (
        // Owner-kind overview counts (docs/OWNER-ROADMAP-BRIEF.md §3.2): open
        // work orders, units, locations, vendors — customers/equipment-types/
        // scans don't carry their own card in this row for owner-kind.
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/dashboard/requests">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open work orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{openRequestCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/equipment">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Equipment units
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{equipmentCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/locations">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Locations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{locationCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/vendors">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{vendorCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Link href="/dashboard/customers">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Customers
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{customerCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/requests">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Open service requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{openRequestCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/equipment">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Equipment units
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{equipmentCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/dashboard/equipment-types">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Equipment types
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{typeCount ?? 0}</p>
              </CardContent>
            </Card>
          </Link>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <ScanLine className="size-3.5" />
                Scans (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{scanCount ?? 0}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {showChecklist && (
        <GettingStartedChecklist items={checklistItems} dismissible={profile.role === "owner"} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-2xl font-bold">{requestsThisMonth}</p>
                <p className="text-xs text-muted-foreground">Requests this month</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{requestsLastMonth}</p>
                <p className="text-xs text-muted-foreground">Requests last month</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{resolvedThisMonth}</p>
                <p className="text-xs text-muted-foreground">Resolved this month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Link href="/dashboard/requests?assignee=unassigned">
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-bold">{unassignedOpenCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Unassigned</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{urgentOpenCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Urgent / high priority</p>
                </div>
                {/* Next roadmap: two-way messaging unread counter (append-only addition). */}
                <div>
                  <p className="text-2xl font-bold">{unreadMessagesCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Unread messages</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {isOwnerKind && (
          <Link href="/dashboard/requests?dispatch=sent">
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle>No vendor response</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{noVendorResponseCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  {noVendorResponseCount ?? 0} dispatch{(noVendorResponseCount ?? 0) === 1 ? "" : "es"} with no vendor
                  response yet
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent {vocab.requestPlural.toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRequests && recentRequests.length > 0 ? (
              <ul className="divide-y">
                {recentRequests.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/dashboard/requests/${request.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-foreground"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {equipmentNameById.get(request.equipment_id) ?? "Unknown equipment"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatRelativeTime(request.created_at)}
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No service requests yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
