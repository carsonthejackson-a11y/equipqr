"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MaintenanceSchedule } from "@/lib/types";
import { addDaysToDateOnly, todayInTimeZone } from "@/lib/schedule";
import { createMaintenanceSchedule, updateMaintenanceSchedule } from "../equipment/maintenance-actions";

const INTERVAL_PRESETS = [30, 60, 90, 180, 365];

export function ScheduleDialog({
  mode,
  schedule,
  equipmentOptions,
  lockEquipmentId,
  checklistTemplates,
  companyTimezone,
  trigger,
}: {
  mode: "create" | "edit";
  /** Required for edit — the row being edited. */
  schedule?: MaintenanceSchedule;
  /** Full picker when the equipment isn't fixed (the /dashboard/maintenance page). */
  equipmentOptions?: { id: string; name: string }[];
  /** Launched from a specific unit's page — hides the equipment picker and locks the value. */
  lockEquipmentId?: string;
  checklistTemplates: { id: string; name: string }[];
  companyTimezone: string;
  trigger?: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [equipmentId, setEquipmentId] = useState(schedule?.equipment_id ?? lockEquipmentId ?? "");
  const [intervalDays, setIntervalDays] = useState(String(schedule?.interval_days ?? 90));
  const [nextDueOn, setNextDueOn] = useState(
    schedule?.next_due_on ?? addDaysToDateOnly(todayInTimeZone(companyTimezone), 90)
  );
  const [autoCreate, setAutoCreate] = useState(schedule?.auto_create_request ?? true);
  const [notifyCustomer, setNotifyCustomer] = useState(schedule?.notify_customer ?? true);
  const [checklistTemplateId, setChecklistTemplateId] = useState(schedule?.checklist_template_id ?? "");

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result =
      mode === "edit" && schedule
        ? await updateMaintenanceSchedule(schedule.id, formData)
        : await createMaintenanceSchedule(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    toast.success(mode === "edit" ? "Schedule updated" : "Schedule created");
    setOpen(false);
    router.refresh();
  }

  const equipmentName = lockEquipmentId
    ? equipmentOptions?.find((e) => e.id === lockEquipmentId)?.name
    : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Plus className="size-4" />
              New schedule
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit maintenance schedule" : "New maintenance schedule"}</DialogTitle>
          <DialogDescription>
            Automatically create a service request on a recurring interval, e.g. &ldquo;descale every 90
            days&rdquo;.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {error && <p className="text-sm text-destructive">{error}</p>}

          {lockEquipmentId ? (
            <input type="hidden" name="equipmentId" value={lockEquipmentId} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="equipmentId">Equipment</Label>
              <Select
                name="equipmentId"
                value={equipmentId}
                onValueChange={(v) => setEquipmentId(v ?? "")}
                items={Object.fromEntries((equipmentOptions ?? []).map((e) => [e.id, e.name]))}
                required
              >
                <SelectTrigger id="equipmentId" className="w-full">
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {(equipmentOptions ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {equipmentName && <p className="text-sm text-muted-foreground">For {equipmentName}.</p>}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Descale"
              defaultValue={schedule?.name}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={schedule?.description ?? ""}
              placeholder="Anything a tech should do as part of this service."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="intervalDays">Repeat every (days)</Label>
            <div className="flex flex-wrap gap-1.5">
              {INTERVAL_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={intervalDays === String(preset) ? "secondary" : "outline"}
                  onClick={() => setIntervalDays(String(preset))}
                >
                  {preset}
                </Button>
              ))}
            </div>
            <Input
              id="intervalDays"
              name="intervalDays"
              type="number"
              min={1}
              max={3650}
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="leadDays">Notify/create N days ahead</Label>
              <Input id="leadDays" name="leadDays" type="number" min={0} max={365} defaultValue={schedule?.lead_days ?? 14} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextDueOn">Next due</Label>
              <Input
                id="nextDueOn"
                name="nextDueOn"
                type="date"
                value={nextDueOn}
                onChange={(e) => setNextDueOn(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="checklistTemplateId">Checklist (optional)</Label>
            <Select
              name="checklistTemplateId"
              value={checklistTemplateId}
              onValueChange={(v) => setChecklistTemplateId(v ?? "")}
              items={Object.fromEntries(checklistTemplates.map((t) => [t.id, t.name]))}
            >
              <SelectTrigger id="checklistTemplateId" className="w-full">
                <SelectValue placeholder="No checklist" />
              </SelectTrigger>
              <SelectContent>
                {checklistTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoCreateRequest"
                name="autoCreateRequest"
                checked={autoCreate}
                onCheckedChange={(checked) => setAutoCreate(checked === true)}
              />
              <Label htmlFor="autoCreateRequest" className="font-normal">
                Automatically create a service request when due
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="notifyCustomer"
                name="notifyCustomer"
                checked={notifyCustomer}
                onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
              />
              <Label htmlFor="notifyCustomer" className="font-normal">
                Email the customer when it&apos;s due
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
