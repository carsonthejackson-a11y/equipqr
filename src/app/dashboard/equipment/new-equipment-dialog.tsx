"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QrScanButton } from "@/components/qr-scan-button";
import { EQUIPMENT_STATUS_LABELS } from "@/components/status-badge";
import { toast } from "sonner";
import type { Customer, EquipmentType } from "@/lib/types";
import { normalizeQrCode } from "@/lib/short-code";
import { FEATURES } from "@/lib/features";
import { createEquipment } from "./actions";

const statusItems = Object.fromEntries(Object.entries(EQUIPMENT_STATUS_LABELS));

export function NewEquipmentDialog({
  equipmentTypes,
  customers,
  batchQrEnabled = true,
}: {
  equipmentTypes: EquipmentType[];
  customers: Customer[];
  /** Whether the company's plan includes pre-printed batch QR codes (src/lib/plans.ts `batchQr`). Informational only — claiming still works either way. */
  batchQrEnabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [codeSource, setCodeSource] = useState("instant");
  const [preprintedCode, setPreprintedCode] = useState("");

  function handleCustomerChange(value: string | null) {
    setCustomerId(value ?? "");
    const customer = customers.find((c) => c.id === value);
    setAddress(customer?.address ?? "");
    setContactName(customer?.contact_name ?? "");
    setContactPhone(customer?.contact_phone ?? "");
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await createEquipment(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.codeError) {
      toast.warning(`Equipment created, but couldn't link that QR code: ${result.codeError}`);
    }

    setOpen(false);
    if (result?.id) {
      router.push(`/dashboard/equipment/${result.id}`);
    }
  }

  const noTypes = equipmentTypes.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={noTypes} title={noTypes ? "Create an equipment type first" : undefined}>
            New equipment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New equipment</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">Name / label</Label>
            <Input id="name" name="name" placeholder="e.g. Break room water heater" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="equipmentTypeId">Equipment type</Label>
            <Select
              name="equipmentTypeId"
              items={Object.fromEntries(equipmentTypes.map((type) => [type.id, type.name]))}
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
            <Select name="status" items={statusItems} defaultValue="active" required>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="make">Make (optional)</Label>
              <Input id="make" name="make" placeholder="e.g. Rheem" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model (optional)</Label>
              <Input id="model" name="model" placeholder="e.g. XG40T06" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerId">Customer (optional)</Label>
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
              Selecting a customer fills in the address and contact below.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address (optional)</Label>
            <Textarea
              id="address"
              name="address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactName">Site contact name (optional)</Label>
            <Input
              id="contactName"
              name="contactName"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Site contact phone (optional)</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serialNumber">Serial number (optional)</Label>
            <Input id="serialNumber" name="serialNumber" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location within site (optional)</Label>
            <Input id="location" name="location" placeholder="e.g. Building A, Floor 2" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="installDate">Install date (optional)</Label>
              <Input id="installDate" name="installDate" type="date" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warrantyEndsOn">Warranty ends (optional)</Label>
              <Input id="warrantyEndsOn" name="warrantyEndsOn" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Anything a tech should know before they walk up to this unit."
            />
          </div>
          {FEATURES.batchQr ? (
            <div className="space-y-3 rounded-lg border p-3">
              <Label>How do you want to set up this equipment&apos;s QR code?</Label>
              <RadioGroup name="codeSource" value={codeSource} onValueChange={setCodeSource}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="instant" id="codeSource-instant" className="mt-0.5" />
                  <Label htmlFor="codeSource-instant" className="flex-1 font-normal">
                    <span className="block font-medium text-foreground">Generate a new code now</span>
                    <span className="block text-sm text-muted-foreground">
                      Creates a QR code you can print yourself right away.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="preprinted" id="codeSource-preprinted" className="mt-0.5" />
                  <Label htmlFor="codeSource-preprinted" className="flex-1 font-normal">
                    <span className="block font-medium text-foreground">Use a pre-printed code</span>
                    <span className="block text-sm text-muted-foreground">
                      Enter the code from one of your physical stickers.
                      {!batchQrEnabled && " Batch-printed codes are a Pro plan feature."}
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              {codeSource === "preprinted" && (
                <div className="flex gap-2">
                  <Input
                    name="preprintedCode"
                    placeholder="e.g. AB3D-9F2K"
                    className="font-mono uppercase"
                    value={preprintedCode}
                    onChange={(e) => setPreprintedCode(e.target.value)}
                  />
                  <QrScanButton onScan={(code) => setPreprintedCode(normalizeQrCode(code))} />
                </div>
              )}
            </div>
          ) : (
            <input type="hidden" name="codeSource" value="instant" />
          )}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
