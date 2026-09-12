"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
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
import type { CategoryDefaultVendor, CompanyKind, Customer, EquipmentCustomField, EquipmentType, Location, Vendor } from "@/lib/types";
import { normalizeQrCode } from "@/lib/short-code";
import { downscaleToJpeg, blobToBase64 } from "@/lib/client-image";
import { FEATURES } from "@/lib/features";
import { createEquipment } from "./actions";
import { CustomFieldsInputs } from "./custom-fields-inputs";
import { VendorSelect } from "./vendor-select";

const statusItems = Object.fromEntries(Object.entries(EQUIPMENT_STATUS_LABELS));

export function NewEquipmentDialog({
  equipmentTypes,
  customers,
  customFields = [],
  batchQrEnabled = true,
  kind = "service_provider",
  locations = [],
  vendors = [],
  categoryDefaultVendors = [],
}: {
  equipmentTypes: EquipmentType[];
  customers: Customer[];
  /** The company's field definitions (Settings → Custom fields), in display order. */
  customFields?: EquipmentCustomField[];
  /** Whether the company's plan includes pre-printed batch QR codes (src/lib/plans.ts `batchQr`). Informational only — claiming still works either way. */
  batchQrEnabled?: boolean;
  /** Owner-kind swaps the customer field for location/vendor/warranty-vendor fields (docs/OWNER-ROADMAP-BRIEF.md §3.2). */
  kind?: CompanyKind;
  locations?: Location[];
  vendors?: Vendor[];
  categoryDefaultVendors?: CategoryDefaultVendor[];
}) {
  const router = useRouter();
  const isOwner = kind === "equipment_owner";
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [codeSource, setCodeSource] = useState("instant");
  const [preprintedCode, setPreprintedCode] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [equipmentTypeId, setEquipmentTypeId] = useState("");
  const [warrantyEndsOn, setWarrantyEndsOn] = useState("");
  const nameplateInputRef = useRef<HTMLInputElement>(null);

  const categoryDefaultVendor = (() => {
    const defaultRow = categoryDefaultVendors.find((cd) => cd.equipment_type_id === equipmentTypeId);
    return defaultRow ? (vendors.find((v) => v.id === defaultRow.vendor_id) ?? null) : null;
  })();

  async function handleScanNameplate(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setScanError(null);
    setScanning(true);
    try {
      const jpeg = await downscaleToJpeg(file);
      const base64 = await blobToBase64(jpeg);
      const response = await fetch("/api/nameplate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? "Couldn't read that nameplate.");
      }
      const fields = body?.fields as {
        make: string | null;
        model: string | null;
        serial_number: string | null;
      };
      if (fields.make) setMake(fields.make);
      if (fields.model) setModel(fields.model);
      if (fields.serial_number) setSerialNumber(fields.serial_number);
      if (!fields.make && !fields.model && !fields.serial_number) {
        toast.warning("Couldn't make anything out on that nameplate — fill it in by hand.");
      } else {
        toast.success("Filled in from the nameplate");
      }
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : "Couldn't read that nameplate.");
    } finally {
      setScanning(false);
    }
  }

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
              value={equipmentTypeId}
              onValueChange={(value) => setEquipmentTypeId(value ?? "")}
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
          <div className="space-y-2 rounded-lg border p-3">
            <input
              ref={nameplateInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScanNameplate}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => nameplateInputRef.current?.click()}
              disabled={scanning}
            >
              {scanning ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {scanning ? "Reading nameplate..." : "Scan nameplate"}
            </Button>
            {scanError && <p className="text-sm text-destructive">{scanError}</p>}
            <p className="text-xs text-muted-foreground">
              Photograph the data plate to fill in make, model and serial number below.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="make">Make (optional)</Label>
              <Input
                id="make"
                name="make"
                placeholder="e.g. Rheem"
                value={make}
                onChange={(e) => setMake(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model (optional)</Label>
              <Input
                id="model"
                name="model"
                placeholder="e.g. XG40T06"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          {isOwner ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="locationId">Location (optional)</Label>
                <Select
                  name="locationId"
                  items={{ "": "No location", ...Object.fromEntries(locations.map((l) => [l.id, l.name])) }}
                  defaultValue=""
                >
                  <SelectTrigger id="locationId" className="w-full">
                    <SelectValue placeholder="No location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No location</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorId">Vendor</Label>
                <VendorSelect name="vendorId" kind="vendor" vendors={vendors} categoryDefault={categoryDefaultVendor} />
                <p className="text-sm text-muted-foreground">
                  Work orders for this unit go to this vendor, or to the category default when
                  left as-is.
                </p>
              </div>
            </>
          ) : (
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
          )}
          {!isOwner && (
            <>
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
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="serialNumber">Serial number (optional)</Label>
            <Input
              id="serialNumber"
              name="serialNumber"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
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
              <Input
                id="warrantyEndsOn"
                name="warrantyEndsOn"
                type="date"
                value={warrantyEndsOn}
                onChange={(e) => setWarrantyEndsOn(e.target.value)}
              />
            </div>
          </div>
          {isOwner && warrantyEndsOn && (
            <div className="space-y-2">
              <Label htmlFor="warrantyVendorId">Warranty vendor (optional)</Label>
              <VendorSelect name="warrantyVendorId" kind="warranty" vendors={vendors} />
              <p className="text-sm text-muted-foreground">
                Preferred over the unit&apos;s vendor while the warranty is still active.
              </p>
            </div>
          )}
          {customFields.length > 0 && (
            <fieldset className="space-y-4 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Custom fields</legend>
              <CustomFieldsInputs definitions={customFields} />
            </fieldset>
          )}
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
