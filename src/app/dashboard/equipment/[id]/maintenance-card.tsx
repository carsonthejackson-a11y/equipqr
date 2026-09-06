import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { addDaysToDateOnly, formatDateOnly, todayInTimeZone } from "@/lib/schedule";
import type { ChecklistTemplate, Company, Equipment, MaintenanceSchedule } from "@/lib/types";
import { ScheduleDialog } from "../../maintenance/schedule-dialog";
import { ScheduleRowActions } from "../../maintenance/schedule-row-actions";

/**
 * Self-contained server component (same pattern as ./qr-section.tsx): fetches
 * this unit's maintenance schedules and the company timezone + checklist
 * templates the "Add schedule" dialog needs, so equipment/[id]/page.tsx only
 * renders `<MaintenanceCard equipment={equipment} />`.
 */
export async function MaintenanceCard({ equipment }: { equipment: Equipment }) {
  const supabase = await createClient();

  const [{ data: schedules }, { data: company }, { data: templates }] = await Promise.all([
    supabase
      .from("maintenance_schedules")
      .select("*")
      .eq("equipment_id", equipment.id)
      .order("next_due_on", { ascending: true })
      .returns<MaintenanceSchedule[]>(),
    supabase.from("companies").select("timezone").eq("id", equipment.company_id).maybeSingle<Pick<Company, "timezone">>(),
    supabase
      .from("checklist_templates")
      .select("id, name")
      .eq("active", true)
      .returns<Pick<ChecklistTemplate, "id" | "name">[]>(),
  ]);

  const timezone = company?.timezone ?? "UTC";
  const today = todayInTimeZone(timezone);
  const checklistTemplates = templates ?? [];
  const equipmentOptions = [{ id: equipment.id, name: equipment.name }];
  const rows = schedules ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Maintenance</CardTitle>
        <ScheduleDialog
          mode="create"
          lockEquipmentId={equipment.id}
          equipmentOptions={equipmentOptions}
          checklistTemplates={checklistTemplates}
          companyTimezone={timezone}
          trigger={
            <button type="button" className="text-sm text-primary hover:underline">
              Add schedule
            </button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No maintenance schedules for this unit yet.</p>
        ) : (
          rows.map((schedule) => {
            const overdue = schedule.active && schedule.next_due_on < today;
            const dueSoon =
              schedule.active && !overdue && schedule.next_due_on <= addDaysToDateOnly(today, schedule.lead_days);
            return (
              <div
                key={schedule.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
                  !schedule.active && "opacity-60",
                  overdue && "border-destructive/40"
                )}
              >
                <div className="space-y-0.5 text-sm">
                  <p className="font-medium">
                    {schedule.name}
                    {!schedule.active && <span className="ml-2 text-xs text-muted-foreground">(paused)</span>}
                    {overdue && <span className="ml-2 text-xs font-medium text-destructive">Overdue</span>}
                    {dueSoon && !overdue && <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">Due soon</span>}
                  </p>
                  <p className="text-muted-foreground">
                    Every {schedule.interval_days} days · next due {formatDateOnly(schedule.next_due_on)}
                  </p>
                </div>
                <ScheduleRowActions
                  schedule={schedule}
                  equipmentOptions={equipmentOptions}
                  checklistTemplates={checklistTemplates}
                  companyTimezone={timezone}
                />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
