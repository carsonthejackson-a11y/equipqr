"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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
import { CreatableCombobox, type ComboboxOption } from "@/components/creatable-combobox";
import { toast } from "sonner";
import type { CategoryDefaultVendor, CompanyKind, Customer, EquipmentCustomField, EquipmentType, Location, Vendor } from "@/lib/types";
import { normalizeQrCode } from "@/lib/short-code";
import { downscaleToJpeg, blobToBase64 } from "@/lib/client-image";
import { FEATURES } from "@/lib/features";
import { isBillingLimitError } from "@/lib/billing-errors";
import { createEquipment } from "./actions";
import { CustomFieldsInputs } from "./custom-fields-inputs";
import { VendorSelect } from "./vendor-select";
import { createEquipmentType } from "../equipment-types/actions";
import { createCustomer } from "../customers/actions";

const statusItems = Object.fromEntries(Object.entries(EQUIPMENT_STATUS_LABELS));

type SubmitIntent = "print" | "another";

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
  const searchParams = useSearchParams();
  const isOwner = kind === "equipment_owner";

  // ?new=1 (optionally with &type=<id>) opens the dialog straight up — the
  // Overview checklist and equipment-type pages link here instead of
  // duplicating this form (item 4's checklist, item 10's "add a unit of this
  // type"). Read once via lazy init so there's no open-then-flash on mount.
  const [open, setOpen] = useState(() => searchParams.get("new") === "1");
  const [error, setError] = useState<string | null>(null);
  const [submittingIntent, setSubmittingIntent] = useState<SubmitIntent | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [locationId, setLocationId] = useState("");
  const [codeSource, setCodeSource] = useState("instant");
  const [preprintedCode, setPreprintedCode] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [equipmentTypeId, setEquipmentTypeId] = useState(() => {
    const preset = searchParams.get("type");
    return preset && equipmentTypes.some((t) => t.id === preset) ? preset : "";
  });
  const [warrantyEndsOn, setWarrantyEndsOn] = useState("");
  const [showMore, setShowMore] = useState(false);
  // Bumped after "Create & add another" to remount the form and clear every
  // plain uncontrolled field (notes, install date, where-on-site, custom
  // fields) — controlled state is reset explicitly first, in the same
  // batched update, so it re-renders with the right values on the new nodes.
  const [resetKey, setResetKey] = useState(0);
  // Types/customers created inline this session, so the combobox keeps
  // showing them (and "Create & add another" keeps them selected) without
  // waiting on the server props to refresh.
  const [extraTypes, setExtraTypes] = useState<ComboboxOption[]>([]);
  const [extraCustomers, setExtraCustomers] = useState<ComboboxOption[]>([]);
  const nameplateInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Consume ?new=1(&type=...) once mounted so a refresh or back-navigation
  // doesn't reopen the dialog. This is a side effect (navigation), so it
  // belongs in an effect, not the render body — the condition itself makes
  // it self-limiting, since searchParams no longer carries "new" after the
  // first replace.
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    router.replace("/dashboard/equipment");
  }, [searchParams, router]);

  const typeOptions: ComboboxOption[] = [
    ...equipmentTypes.map((t) => ({ value: t.id, label: t.name })),
    ...extraTypes.filter((e) => !equipmentTypes.some((t) => t.id === e.value)),
  ];
  const customerOptions: ComboboxOption[] = [
    ...customers.map((c) => ({ value: c.id, label: c.name })),
    ...extraCustomers.filter((e) => !customers.some((c) => c.id === e.value)),
  ];

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

  function handleCustomerSelect(value: string) {
    setCustomerId(value);
    const customer = customers.find((c) => c.id === value);
    setAddress(customer?.address ?? "");
    setContactName(customer?.contact_name ?? "");
    setContactPhone(customer?.contact_phone ?? "");
  }

  async function handleCreateType(label: string) {
    const formData = new FormData();
    formData.set("name", label);
    const result = await createEquipmentType(formData);
    if ("error" in result) return result;
    setExtraTypes((prev) => [...prev, { value: result.id, label }]);
    return result;
  }

  async function handleCreateCustomer(label: string) {
    const formData = new FormData();
    formData.set("name", label);
    const result = await createCustomer(formData);
    if ("error" in result) return result;
    setExtraCustomers((prev) => [...prev, { value: result.id, label }]);
    return result;
  }

  function resetForOneMore() {
    setMake("");
    setModel("");
    setSerialNumber("");
    setWarrantyEndsOn("");
    setScanError(null);
    setCodeSource("instant");
    setPreprintedCode("");
    // equipmentTypeId, and customerId/address/contact (provider) or
    // locationId (owner), are deliberately left as-is — batch-adding more of
    // the same type at the same site is the point of this button (item 2).
    setResetKey((k) => k + 1);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }

  async function submitEquipment(intent: SubmitIntent) {
    const form = formRef.current;
    if (!form) return;
    // Both buttons get the same native required-field feedback a real submit
    // would give — "Create & add another" is type="button" so it wouldn't
    // trigger that on its own.
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const submittedName = String(formData.get("name") ?? "").trim();

    setSubmittingIntent(intent);
    setError(null);
    const result = await createEquipment(formData);
    setSubmittingIntent(null);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.codeError) {
      toast.warning(`Equipment created, but couldn't link that QR code: ${result.codeError}`);
    }

    if (intent === "print") {
      setOpen(false);
      if (result?.id) {
        router.push(`/dashboard/equipment/${result.id}/label`);
      }
      return;
    }

    toast.success(`${submittedName || "Equipment"} added`);
    resetForOneMore();
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitEquipment("print");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New equipment</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New equipment</DialogTitle>
        </DialogHeader>
        <form
          key={resetKey}
          ref={formRef}
          onSubmit={handleFormSubmit}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name / label</Label>
            <Input
              id="name"
              name="name"
              ref={nameInputRef}
              placeholder="e.g. Break room water heater"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="equipmentTypeId">Equipment type</Label>
            <CreatableCombobox
              id="equipmentTypeId"
              name="equipmentTypeId"
              options={typeOptions}
              value={equipmentTypeId}
              onChange={(value) => setEquipmentTypeId(value)}
              onCreate={handleCreateType}
              placeholder="Search or create a type…"
              emptyLabel="Type a name to create your first equipment type."
              createLabel={(q) => `Create equipment type "${q}"`}
              required
            />
          </div>

          {isOwner ? (
            <div className="space-y-2">
              <Label htmlFor="locationId">Location (optional)</Label>
              <Select
                name="locationId"
                value={locationId}
                onValueChange={(value) => setLocationId(value ?? "")}
                items={{ "": "No location", ...Object.fromEntries(locations.map((l) => [l.id, l.name])) }}
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
          ) : (
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer (optional)</Label>
              <CreatableCombobox
                id="customerId"
                name="customerId"
                options={customerOptions}
                value={customerId}
                onChange={handleCustomerSelect}
                onCreate={handleCreateCustomer}
                placeholder="Search or create a customer…"
                emptyLabel="Type a name to add a new customer."
                createLabel={(q) => `Create customer "${q}"`}
              />
              <p className="text-sm text-muted-foreground">
                Selecting a customer fills in the address and contact below.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="location">Where on site (optional)</Label>
            <Input id="location" name="location" placeholder="e.g. Kitchen, back dock, Building A" />
          </div>

          <div className="border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              aria-expanded={showMore}
              onClick={() => setShowMore((v) => !v)}
            >
              {showMore ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {showMore ? "Hide more details" : "More details"}
            </Button>

            {showMore && (
              <div className="mt-4 space-y-4">
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
                {isOwner && (
                  <div className="space-y-2">
                    <Label htmlFor="vendorId">Vendor</Label>
                    <VendorSelect name="vendorId" kind="vendor" vendors={vendors} categoryDefault={categoryDefaultVendor} />
                    <p className="text-sm text-muted-foreground">
                      Work orders for this unit go to this vendor, or to the category default when
                      left as-is.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial number (optional)</Label>
                  <Input
                    id="serialNumber"
                    name="serialNumber"
                    placeholder="e.g. 4T4H812345"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                  />
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
                        <Label
                          htmlFor="codeSource-instant"
                          className="flex-1 flex-col items-start gap-0.5 font-normal"
                        >
                          <span className="block font-medium text-foreground">Generate a new code now</span>
                          <span className="block text-sm text-muted-foreground">
                            Creates a QR code you can print yourself right away.
                          </span>
                        </Label>
                      </div>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="preprinted" id="codeSource-preprinted" className="mt-0.5" />
                        <Label
                          htmlFor="codeSource-preprinted"
                          className="flex-1 flex-col items-start gap-0.5 font-normal"
                        >
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
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">
              {error}
              {isBillingLimitError(error) && (
                <>
                  {" "}
                  <Link href="/dashboard/settings/billing" className="underline">
                    Go to Billing
                  </Link>
                </>
              )}
            </p>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={!!submittingIntent}
              onClick={() => void submitEquipment("another")}
            >
              {submittingIntent === "another" ? "Adding..." : "Create & add another"}
            </Button>
            <Button type="submit" disabled={!!submittingIntent}>
              {submittingIntent === "print" ? "Creating..." : "Create & print sticker"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
