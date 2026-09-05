"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EQUIPMENT_STATUS_LABELS } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { formatWarranty, warrantyState } from "@/lib/equipment";
import type { Customer, Equipment, EquipmentType } from "@/lib/types";
import { deleteEquipment, updateEquipment } from "../actions";

const statusItems = Object.fromEntries(Object.entries(EQUIPMENT_STATUS_LABELS));

export function EditEquipmentForm({
  equipment,
  equipmentTypes,
  customers,
  canDelete,
}: {
  equipment: Equipment;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
  /** Owners only — technicians can edit every field but not remove the unit. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [customerId, setCustomerId] = useState(equipment.customer_id ?? "");
  const [address, setAddress] = useState(equipment.address ?? "");
  const [contactName, setContactName] = useState(equipment.contact_name ?? "");
  const [contactPhone, setContactPhone] = useState(equipment.contact_phone ?? "");

  function handleCustomerChange(value: string | null) {
    setCustomerId(value ?? "");
    const customer = customers.find((c) => c.id === value);
    if (customer) {
      setAddress(customer.address ?? "");
      setContactName(customer.contact_name ?? "");
      setContactPhone(customer.contact_phone ?? "");
    }
  }

  async function handleSave(formData: FormData) {
    setError(null);
    setSaving(true);
    const result = await updateEquipment(equipment.id, formData);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this equipment? Its QR code will stop working.")) return;
    setDeleting(true);
    const result = await deleteEquipment(equipment.id);
    setDeleting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/dashboard/equipment");
  }

  const warranty = warrantyState(equipment.warranty_ends_on);
  const warrantyLabel = formatWarranty(equipment.warranty_ends_on);

  return (
    <form action={handleSave} className="max-w-xl space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
        <div className="flex items-start gap-2 text-sm">
          <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="text-muted-foreground">Last serviced: </span>
            {equipment.last_serviced_at ? (
              <span title={new Date(equipment.last_serviced_at).toLocaleString()}>
                {formatRelativeTime(equipment.last_serviced_at)}
              </span>
            ) : (
              <span className="text-muted-foreground">no service recorded yet</span>
            )}
          </span>
        </div>
        <div className="flex items-start gap-2 text-sm">
          {warranty.state === "expired" ? (
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              warranty.state === "expired" && "text-destructive",
              warranty.state === "soon" && "text-amber-700 dark:text-amber-400"
            )}
          >
            {warrantyLabel ?? <span className="text-muted-foreground">Warranty: not set</span>}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Name / label</Label>
        <Input id="name" name="name" defaultValue={equipment.name} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="equipmentTypeId">Equipment type</Label>
          <Select
            name="equipmentTypeId"
            items={Object.fromEntries(equipmentTypes.map((type) => [type.id, type.name]))}
            defaultValue={equipment.equipment_type_id}
            required
          >
            <SelectTrigger id="equipmentTypeId" className="w-full">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              {equipmentTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select name="status" items={statusItems} defaultValue={equipment.status} required>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="make">Make</Label>
          <Input id="make" name="make" defaultValue={equipment.make ?? ""} placeholder="e.g. Rheem" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" name="model" defaultValue={equipment.model ?? ""} placeholder="e.g. XG40T06" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="serialNumber">Serial number</Label>
          <Input id="serialNumber" name="serialNumber" defaultValue={equipment.serial_number ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location within site</Label>
          <Input id="location" name="location" defaultValue={equipment.location ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="installDate">Install date</Label>
          <Input
            id="installDate"
            name="installDate"
            type="date"
            defaultValue={equipment.install_date ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="warrantyEndsOn">Warranty ends</Label>
          <Input
            id="warrantyEndsOn"
            name="warrantyEndsOn"
            type="date"
            defaultValue={equipment.warranty_ends_on ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customerId">Customer</Label>
        <Select
          name="customerId"
          value={customerId}
          onValueChange={handleCustomerChange}
          items={Object.fromEntries(customers.map((c) => [c.id, c.name]))}
        >
          <SelectTrigger id="customerId" className="w-full">
            <SelectValue placeholder="No customer" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Changing the customer fills in the address and contact below.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          name="address"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contactName">Site contact name</Label>
          <Input
            id="contactName"
            name="contactName"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contactPhone">Site contact phone</Label>
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={equipment.notes ?? ""}
          placeholder="Anything a tech should know before they walk up to this unit."
        />
        <p className="text-sm text-muted-foreground">
          Internal only — customers never see this on the scan page.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        {canDelete && (
          <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete equipment"}
          </Button>
        )}
      </div>
    </form>
  );
}
