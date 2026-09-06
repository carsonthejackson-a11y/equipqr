import Link from "next/link";
import { CalendarClock, ClipboardList, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { PriorityBadge, OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import {
  addDaysToDateOnly,
  dateKeyInTimeZone,
  formatDuration,
  formatWeekdayLabel,
  formatZonedTime,
  startOfWeek,
  todayInTimeZone,
  weekDates,
  zonedWallTimeToUtcIso,
} from "@/lib/schedule";
import type { CompanyMember, Customer, Equipment, ServiceRequest } from "@/lib/types";
import { ScheduleFilters } from "./schedule-filters";

type ScheduleSearchParams = { week?: string; tech?: string };

const UNSCHEDULABLE_STATUSES = OPEN_REQUEST_STATUSES.filter((s) => s !== "scheduled");
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<ScheduleSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { company } = await getCurrentProfile();

  const today = todayInTimeZone(company.timezone);
  const weekStart = startOfWeek(params.week && WEEK_PATTERN.test(params.week) ? params.week : today);
  const days = weekDates(weekStart);
  const rangeStartIso = zonedWallTimeToUtcIso(weekStart, "00:00", company.timezone);
  const rangeEndIso = zonedWallTimeToUtcIso(addDaysToDateOnly(days[6], 1), "00:00", company.timezone);

  const { data: membersData } = await supabase.rpc("get_company_members");
  const members = (membersData as CompanyMember[] | null) ?? [];

  let scheduledQuery = supabase
    .from("service_requests")
    .select("*")
    .eq("status", "scheduled")
    .gte("scheduled_for", rangeStartIso)
    .lt("scheduled_for", rangeEndIso)
    .order("scheduled_for", { ascending: true });

  let unscheduledQuery = supabase
    .from("service_requests")
    .select("*")
    .in("status", UNSCHEDULABLE_STATUSES)
    .is("scheduled_for", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (params.tech) {
    scheduledQuery = scheduledQuery.eq("assigned_to", params.tech);
    unscheduledQuery = unscheduledQuery.eq("assigned_to", params.tech);
  }

  const [{ data: scheduled }, { data: unscheduled }] = await Promise.all([
    scheduledQuery.returns<ServiceRequest[]>(),
    unscheduledQuery.returns<ServiceRequest[]>(),
  ]);

  const allRequests = [...(scheduled ?? []), ...(unscheduled ?? [])];
  const equipmentIds = [...new Set(allRequests.map((r) => r.equipment_id))];

  const { data: equipment } =
    equipmentIds.length > 0
      ? await supabase
          .from("equipment")
          .select("id, name, customer_id")
          .in("id", equipmentIds)
          .returns<Pick<Equipment, "id" | "name" | "customer_id">[]>()
      : { data: [] as Pick<Equipment, "id" | "name" | "customer_id">[] };

  const customerIds = [...new Set((equipment ?? []).flatMap((e) => (e.customer_id ? [e.customer_id] : [])))];
  const { data: customers } =
    customerIds.length > 0
      ? await supabase.from("customers").select("id, name").in("id", customerIds).returns<Pick<Customer, "id" | "name">[]>()
      : { data: [] as Pick<Customer, "id" | "name">[] };

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const byDay = new Map<string, ServiceRequest[]>();
  for (const day of days) byDay.set(day, []);
  for (const req of scheduled ?? []) {
    if (!req.scheduled_for) continue;
    const key = dateKeyInTimeZone(req.scheduled_for, company.timezone);
    byDay.get(key)?.push(req);
  }

  function visitCard(req: ServiceRequest) {
    const unit = equipmentById.get(req.equipment_id);
    const customer = unit?.customer_id ? customerById.get(unit.customer_id) : undefined;
    const assignee = req.assigned_to ? memberById.get(req.assigned_to) : undefined;
    const firstName = assignee?.full_name?.trim()?.split(" ")[0] ?? assignee?.email;

    return (
      <Link
        key={req.id}
        href={`/dashboard/requests/${req.id}`}
        className="block space-y-1 rounded-lg border bg-card p-2.5 text-xs hover:border-primary/40 hover:shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">
            {req.scheduled_for ? formatZonedTime(req.scheduled_for, company.timezone) : "—"}
          </span>
          <PriorityBadge priority={req.priority} />
        </div>
        <p className="truncate font-medium">{unit?.name ?? "Unknown equipment"}</p>
        {customer && <p className="truncate text-muted-foreground">{customer.name}</p>}
        <p className="text-muted-foreground">
          {formatDuration(req.scheduled_duration_minutes)}
          {firstName && <> · {firstName}</>}
        </p>
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Schedule</h1>
          <p className="text-muted-foreground">Scheduled visits for the week, in {company.timezone}.</p>
        </div>
        <Link
          href="/dashboard/maintenance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <Wrench className="size-4" />
          Preventive maintenance
        </Link>
      </div>

      <ScheduleFilters weekStart={weekStart} today={today} members={members} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
          {days.map((day) => (
            <div key={day} className="space-y-2">
              <p
                className={
                  day === today
                    ? "rounded-md bg-primary/10 px-2 py-1 text-center text-xs font-semibold text-primary"
                    : "px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                }
              >
                {formatWeekdayLabel(day)}
              </p>
              <div className="space-y-2">
                {(byDay.get(day) ?? []).length === 0 ? (
                  <p className="px-2 text-center text-xs text-muted-foreground">—</p>
                ) : (
                  byDay.get(day)!.map((req) => visitCard(req))
                )}
              </div>
            </div>
          ))}
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="size-4" />
              Unscheduled open requests
            </div>
            {(unscheduled ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting to be scheduled.</p>
            ) : (
              <div className="space-y-2">
                {(unscheduled ?? []).map((req) => {
                  const unit = equipmentById.get(req.equipment_id);
                  return (
                    <div key={req.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{unit?.name ?? "Unknown equipment"}</p>
                        <p className="text-muted-foreground">{req.contact_name}</p>
                      </div>
                      <Link
                        href={`/dashboard/requests/${req.id}`}
                        className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                      >
                        <CalendarClock className="size-3.5" />
                        Schedule
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
