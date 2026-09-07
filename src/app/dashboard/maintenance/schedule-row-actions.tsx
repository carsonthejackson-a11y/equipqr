"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MaintenanceSchedule } from "@/lib/types";
import {
  deleteMaintenanceSchedule,
  markMaintenanceDone,
  toggleMaintenanceSchedule,
} from "../equipment/maintenance-actions";
import { ScheduleDialog } from "./schedule-dialog";

// Deliberately inline buttons rather than a dropdown holding the edit
// dialog's trigger: nesting a Dialog trigger inside a Menu item is a known
// focus/portal footgun in most Base UI / Radix-style primitive sets (the
// menu's own close-on-select fights the dialog's open state).
export function ScheduleRowActions({
  schedule,
  equipmentOptions,
  checklistTemplates,
  companyTimezone,
}: {
  schedule: MaintenanceSchedule;
  equipmentOptions: { id: string; name: string }[];
  checklistTemplates: { id: string; name: string }[];
  companyTimezone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleMarkDone() {
    if (!confirm(`Mark "${schedule.name}" as completed today? This rolls the schedule forward.`)) return;
    setBusy(true);
    const result = await markMaintenanceDone(schedule.id);
    setBusy(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked done");
    router.refresh();
  }

  async function handleToggle() {
    setBusy(true);
    const result = await toggleMaintenanceSchedule(schedule.id, !schedule.active);
    setBusy(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm(`Delete the "${schedule.name}" schedule? This can't be undone.`)) return;
    setBusy(true);
    const result = await deleteMaintenanceSchedule(schedule.id);
    setBusy(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Schedule deleted");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={handleMarkDone} disabled={busy}>
        <CheckCircle2 className="size-3.5" />
        Mark done
      </Button>
      <ScheduleDialog
        mode="edit"
        schedule={schedule}
        equipmentOptions={equipmentOptions}
        checklistTemplates={checklistTemplates}
        companyTimezone={companyTimezone}
        trigger={
          <Button size="icon-sm" variant="ghost" title="Edit schedule">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button size="icon-sm" variant="ghost" onClick={handleToggle} disabled={busy} title={schedule.active ? "Pause" : "Resume"}>
        {schedule.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </Button>
      <Button size="icon-sm" variant="ghost" onClick={handleDelete} disabled={busy} title="Delete">
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
