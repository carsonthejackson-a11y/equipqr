import { redirect } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CalendarClock, ClipboardList, ExternalLink, MapPin, Navigation, Phone, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/company-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { OPEN_REQUEST_STATUSES, StatusBadge, PriorityBadge } from "@/components/status-badge";
import { mapsHref, telHref } from "@/lib/contact-links";
import { getEquipmentPublicUrl } from "@/lib/qr";
import { formatWeekdayLabel, todayInTimeZone } from "@/lib/schedule";
import type { Customer, Equipment, MaintenanceSchedule, QrCode } from "@/lib/types";
import { groupTodayRequests, pmDueWithin, type TodayRequest } from "./today-data";

/** A fetched service_requests row, widened with the two phone fields Today
 * needs for its Call action that today-data.ts's pure TodayRequest doesn't
 * carry (that type only has what the grouping logic itself reads). */
type TodayRequestRow = TodayRequest & { contact_phone: string | null; reporter_phone: string | null };

/**
 * The technician's phone-first "what do I do today" home (Q-47, I3 §C).
 * Provider-kind only — an equipment_owner company dispatches to vendors
 * instead of running its own visit schedule, so there's no "my visits
 * today" concept for it; it's sent to the inbox instead. All grouping/
 * ordering is done by the pure, unit-tested helpers in today-data.ts —
 * this file is just fetch + join + render.
 */
export default async function TodayPage() {
  const supabase = await createClient();
  const ctx = await getCompanyContext();

  if (ctx.kind === "equipment_owner") {
    redirect("/dashboard/requests");
  }

  const today = todayInTimeZone(ctx.fmt.timeZone);

  const [{ data: requestRows }, { data: scheduleRows }] = await Promise.all([
    supabase
      .from("service_requests")
      .select(
        "id, equipment_id, customer_id, location_id, status, priority, scheduled_for, assigned_to, contact_name, contact_phone, reporter_phone, description, ai_summary, created_at, unread_customer_messages"
      )
      .in("status", OPEN_REQUEST_STATUSES)
      .returns<TodayRequestRow[]>(),
    supabase
      .from("maintenance_schedules")
      .select("id, equipment_id, name, active, next_due_on")
      .eq("active", true)
      .returns<MaintenanceSchedule[]>(),
  ]);

  const requests = requestRows ?? [];
  const schedules = scheduleRows ?? [];
  const groups = groupTodayRequests(requests, today, ctx.fmt.timeZone, ctx.profile.id);
  const duePm = pmDueWithin(schedules, today);

  const equipmentIds = [
    ...new Set([...requests.map((r) => r.equipment_id), ...duePm.map((s) => s.equipment_id)]),
  ];
  const customerIds = [...new Set(requests.flatMap((r) => (r.customer_id ? [r.customer_id] : [])))];

  const [{ data: equipment }, { data: customers }, { data: qrCodes }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("*").in("id", equipmentIds).returns<Equipment[]>()
      : Promise.resolve({ data: [] as Equipment[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("*").in("id", customerIds).returns<Customer[]>()
      : Promise.resolve({ data: [] as Customer[] }),
    equipmentIds.length > 0
      ? supabase
          .from("qr_codes")
          .select("equipment_id, short_code")
          .in("equipment_id", equipmentIds)
          .eq("status", "active")
          .returns<Pick<QrCode, "equipment_id" | "short_code">[]>()
      : Promise.resolve({ data: [] as Pick<QrCode, "equipment_id" | "short_code">[] }),
  ]);

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const shortCodeByEquipmentId = new Map((qrCodes ?? []).map((c) => [c.equipment_id, c.short_code]));

  function problemLine(req: TodayRequest): string {
    return (req.ai_summary?.trim() || req.description || "").trim();
  }

  function addressFor(req: TodayRequest): string | null {
    const customer = req.customer_id ? customerById.get(req.customer_id) : undefined;
    const unit = equipmentById.get(req.equipment_id);
    return customer?.address ?? unit?.address ?? unit?.location ?? null;
  }

  function phoneFor(req: TodayRequestRow): string | null {
    return req.contact_phone ?? req.reporter_phone ?? null;
  }

  const isEmpty =
    groups.visitsToday.length === 0 &&
    groups.overdueVisits.length === 0 &&
    groups.assignedUnscheduled.length === 0 &&
    duePm.length === 0;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-muted-foreground">{formatWeekdayLabel(today)}</p>
      </div>

      {isEmpty && (
        <EmptyState
          icon={ClipboardList}
          message="Nothing on your plate right now — no visits today, nothing overdue, and no unscheduled work assigned to you."
        />
      )}

      {groups.overdueVisits.length > 0 && (
        <TodaySection title="Overdue visits" icon={AlertTriangle} tone="destructive">
          {groups.overdueVisits.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              timeLabel={ctx.fmt.dateTime(req.scheduled_for as string)}
              unit={equipmentById.get(req.equipment_id)}
              customerName={req.customer_id ? customerById.get(req.customer_id)?.name : undefined}
              address={addressFor(req)}
              phone={phoneFor(req)}
              shortCode={shortCodeByEquipmentId.get(req.equipment_id)}
              problem={problemLine(req)}
            />
          ))}
        </TodaySection>
      )}

      {groups.visitsToday.length > 0 && (
        <TodaySection title="Visits today" icon={CalendarClock}>
          {groups.visitsToday.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              timeLabel={ctx.fmt.time(req.scheduled_for as string)}
              unit={equipmentById.get(req.equipment_id)}
              customerName={req.customer_id ? customerById.get(req.customer_id)?.name : undefined}
              address={addressFor(req)}
              phone={phoneFor(req)}
              shortCode={shortCodeByEquipmentId.get(req.equipment_id)}
              problem={problemLine(req)}
            />
          ))}
        </TodaySection>
      )}

      {groups.assignedUnscheduled.length > 0 && (
        <TodaySection title="Your other open jobs" icon={ClipboardList}>
          {groups.assignedUnscheduled.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              unit={equipmentById.get(req.equipment_id)}
              customerName={req.customer_id ? customerById.get(req.customer_id)?.name : undefined}
              address={addressFor(req)}
              phone={phoneFor(req)}
              shortCode={shortCodeByEquipmentId.get(req.equipment_id)}
              problem={problemLine(req)}
            />
          ))}
        </TodaySection>
      )}

      {duePm.length > 0 && (
        <TodaySection title="Preventive maintenance due this week" icon={Wrench}>
          {duePm.map((schedule) => {
            const unit = equipmentById.get(schedule.equipment_id);
            const overdue = schedule.next_due_on < today;
            return (
              <Card key={schedule.id} className={overdue ? "border-destructive/40" : undefined}>
                <CardContent className="space-y-1 py-4 text-sm">
                  <p className="font-medium">{schedule.name}</p>
                  <p className="text-muted-foreground">
                    {unit ? (
                      <Link href={`/dashboard/equipment/${unit.id}`} className="hover:underline">
                        {unit.name}
                      </Link>
                    ) : (
                      "Unknown equipment"
                    )}
                  </p>
                  <p className={overdue ? "font-medium text-destructive" : ""}>
                    {overdue ? "Overdue since" : "Due"} {schedule.next_due_on}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </TodaySection>
      )}
    </div>
  );
}

function TodaySection({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone?: "destructive";
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className={`flex items-center gap-1.5 text-sm font-semibold ${tone === "destructive" ? "text-destructive" : ""}`}>
        <Icon className="size-4" />
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** One visit/work card — used by all three request-backed sections, with an optional time badge (visits only). */
function RequestCard({
  req,
  timeLabel,
  unit,
  customerName,
  address,
  phone,
  shortCode,
  problem,
}: {
  req: TodayRequest;
  timeLabel?: string;
  unit: Equipment | undefined;
  customerName: string | undefined;
  address: string | null;
  phone: string | null;
  shortCode: string | undefined;
  problem: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            {timeLabel && <p className="text-sm font-semibold">{timeLabel}</p>}
            <p className="font-medium">{unit?.name ?? "Unknown equipment"}</p>
            {customerName && <p className="text-sm text-muted-foreground">{customerName}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <PriorityBadge priority={req.priority} />
            <StatusBadge status={req.status} />
          </div>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{problem || "No description provided."}</p>

        {address && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            {address}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap">
          {phone && (
            <Button variant="outline" className="h-11 justify-center gap-1.5" render={<a href={telHref(phone)} />}>
              <Phone className="size-3.5" />
              Call
            </Button>
          )}
          {address && (
            <Button
              variant="outline"
              className="h-11 justify-center gap-1.5"
              render={<a href={mapsHref(address)} target="_blank" rel="noreferrer" />}
            >
              <Navigation className="size-3.5" />
              Directions
            </Button>
          )}
          {shortCode && (
            <Button
              variant="outline"
              className="h-11 justify-center gap-1.5"
              render={<a href={getEquipmentPublicUrl(shortCode)} target="_blank" rel="noreferrer" />}
            >
              <Wrench className="size-3.5" />
              Open unit
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 justify-center gap-1.5"
            nativeButton={false}
            render={<Link href={`/dashboard/requests/${req.id}`} />}
          >
            <ExternalLink className="size-3.5" />
            Open request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
