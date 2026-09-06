import Link from "next/link";
import { CalendarCheck2, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { addDaysToDateOnly, formatDateOnly, todayInTimeZone } from "@/lib/schedule";
import type { ChecklistTemplate, Customer, Equipment, MaintenanceSchedule } from "@/lib/types";
import { ScheduleDialog } from "./schedule-dialog";
import { ScheduleRowActions } from "./schedule-row-actions";

export default async function MaintenancePage() {
  const supabase = await createClient();
  const { company } = await getCurrentProfile();

  const [{ data: schedules }, { data: equipment }, { data: customers }, { data: templates }] = await Promise.all([
    supabase
      .from("maintenance_schedules")
      .select("*")
      .order("next_due_on", { ascending: true })
      .returns<MaintenanceSchedule[]>(),
    supabase.from("equipment").select("*").order("name").returns<Equipment[]>(),
    supabase.from("customers").select("id, name").returns<Pick<Customer, "id" | "name">[]>(),
    supabase
      .from("checklist_templates")
      .select("id, name")
      .eq("active", true)
      .returns<Pick<ChecklistTemplate, "id" | "name">[]>(),
  ]);

  const equipmentById = new Map((equipment ?? []).map((e) => [e.id, e]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const equipmentOptions = (equipment ?? []).map((e) => ({ id: e.id, name: e.name }));
  const checklistTemplates = templates ?? [];
  const today = todayInTimeZone(company.timezone);

  const rows = (schedules ?? []).sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.next_due_on.localeCompare(b.next_due_on);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Preventive maintenance</h1>
          <p className="text-muted-foreground">
            Recurring service schedules — a request is created automatically as each one comes due.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/schedule"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <CalendarDays className="size-4" />
            View visit schedule
          </Link>
          <ScheduleDialog
            mode="create"
            equipmentOptions={equipmentOptions}
            checklistTemplates={checklistTemplates}
            companyTimezone={company.timezone}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          message="No maintenance schedules yet. Add one to have EquipQR create a service request automatically as it comes due."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((schedule) => {
            const unit = equipmentById.get(schedule.equipment_id);
            const customer = unit?.customer_id ? customerById.get(unit.customer_id) : undefined;
            const overdue = schedule.active && schedule.next_due_on < today;
            const dueSoon =
              schedule.active && !overdue && schedule.next_due_on <= addDaysToDateOnly(today, schedule.lead_days);

            return (
              <Card
                key={schedule.id}
                className={cn(!schedule.active && "opacity-60", overdue && "border-destructive/40")}
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{schedule.name}</p>
                      {!schedule.active && <Badge className="border bg-slate-500/10 text-muted-foreground">Paused</Badge>}
                      {overdue && (
                        <Badge className="border border-destructive/20 bg-destructive/10 text-destructive">Overdue</Badge>
                      )}
                      {dueSoon && !overdue && (
                        <Badge className="border border-amber-500/20 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                          Due soon
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {unit ? (
                        <Link href={`/dashboard/equipment/${unit.id}`} className="hover:underline">
                          {unit.name}
                        </Link>
                      ) : (
                        "Unknown equipment"
                      )}
                      {customer && <> · {customer.name}</>}
                      {" · "}Every {schedule.interval_days} days
                    </p>
                    <p className="text-sm">
                      Next due <span className="font-medium">{formatDateOnly(schedule.next_due_on)}</span>
                      {schedule.last_completed_on && (
                        <span className="text-muted-foreground"> · last done {formatDateOnly(schedule.last_completed_on)}</span>
                      )}
                    </p>
                  </div>

                  <ScheduleRowActions
                    schedule={schedule}
                    equipmentOptions={equipmentOptions}
                    checklistTemplates={checklistTemplates}
                    companyTimezone={company.timezone}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
