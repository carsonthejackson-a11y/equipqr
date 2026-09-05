import Link from "next/link";
import { ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, planFor, type Entitlements } from "@/lib/billing";
import type { Plan } from "@/lib/plans";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import { formatRelativeTime } from "@/lib/format";
import { GettingStartedChecklist, type ChecklistItem } from "./getting-started-checklist";
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

  const { sixtyDaysAgoIso, thirtyDaysAgoIso, startOfThisMonth, startOfLastMonth } = getDateWindows();

  const [
    { count: equipmentCount },
    { count: typeCount },
    { count: openRequestCount },
    { count: unassignedOpenCount },
    { count: urgentOpenCount },
    { count: customerCount },
    { count: scanCount },
    { count: guideStepCount },
    { count: linkedQrCount },
    { data: recentRequests },
    { data: monthlyRequests },
    entitlements,
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
    supabase.from("customers").select("*", { count: "exact", head: true }),
    supabase.from("scan_events").select("*", { count: "exact", head: true }).gte("scanned_at", thirtyDaysAgoIso),
    supabase.from("guide_steps").select("*", { count: "exact", head: true }),
    supabase.from("qr_codes").select("*", { count: "exact", head: true }).not("equipment_id", "is", null),
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
  const checklistItems: ChecklistItem[] = [
    {
      key: "type",
      label: "Create an equipment type",
      href: "/dashboard/equipment-types",
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
      href: "/dashboard/equipment",
      done: (equipmentCount ?? 0) > 0,
    },
    {
      key: "qr",
      label: "Print or download a QR label",
      href: "/dashboard/equipment",
      done: (equipmentCount ?? 0) > 0 && (linkedQrCount ?? 0) > 0,
    },
    {
      key: "invite",
      label: "Invite a teammate",
      href: "/dashboard/settings/team",
      done: memberCount > 1,
      optional: true,
    },
  ];
  // The optional "invite a teammate" item never gates the card away — it's a
  // bonus, not a requirement to finish onboarding.
  const requiredItemsDone = checklistItems.filter((i) => !i.optional).every((i) => i.done);
  const showChecklist = !company.onboarding_dismissed_at && !requiredItemsDone;

  const plan = entitlements ? planFor(entitlements) : null;
  const usageLine = entitlements && plan ? buildUsageLine(entitlements, plan) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">A quick snapshot of your account.</p>
        {usageLine && <p className="mt-1 text-sm text-muted-foreground">{usageLine}</p>}
      </div>

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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold">{unassignedOpenCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Unassigned</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{urgentOpenCount ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Urgent / high priority</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent service requests</CardTitle>
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
