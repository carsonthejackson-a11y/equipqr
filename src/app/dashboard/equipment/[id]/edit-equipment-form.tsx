"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import type { Customer, Equipment, EquipmentType } from "@/lib/types";
import { deleteEquipment, updateEquipment } from "../actions";

export function EditEquipmentForm({
  equipment,
  equipmentTypes,
  customers,
}: {
  equipment: Equipment;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
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
    const result = await updateEquipment(equipment.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
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

  return (
    <form action={handleSave} className="max-w-lg space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name / label</Label>
        <Input id="name" name="name" defaultValue={equipment.name} required />
      </div>
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
      <div className="space-y-2">
        <Label htmlFor="serialNumber">Serial number</Label>
        <Input id="serialNumber" name="serialNumber" defaultValue={equipment.serial_number ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location within site</Label>
        <Input id="location" name="location" defaultValue={equipment.location ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete equipment"}
        </Button>
      </div>
    </form>
  );
}
