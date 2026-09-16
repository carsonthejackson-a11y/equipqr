"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreatableCombobox, type ComboboxOption } from "@/components/creatable-combobox";
import { QrScanButton } from "@/components/qr-scan-button";
import { downscaleToJpeg, blobToBase64 } from "@/lib/client-image";
import type { Customer, EquipmentType } from "@/lib/types";
import { onboardEquipment } from "../actions";
import { createEquipmentType } from "@/app/dashboard/equipment-types/actions";
import { createCustomer } from "@/app/dashboard/customers/actions";

/** Mirrors src/lib/nameplate.ts's NameplateFields — kept local so this client
 * component never imports that server module (it pulls in the Anthropic SDK). */
type NameplateFields = {
  make: string | null;
  model: string | null;
  serial_number: string | null;
  voltage: string | null;
  year: string | null;
  other_notes: string | null;
  confidence: "low" | "normal" | "high";
};

type Step = "photo" | "form";

/**
 * Two-screen scan-to-onboard flow for a staff member standing at a freshly
 * stuck, still-unclaimed sticker: photograph the nameplate (or skip), then a
 * prefilled add-equipment form. See src/app/e/[qrToken]/actions.ts's
 * onboardEquipment() for what happens on submit (creates the unit, claims
 * this code to it, then hands back — no redirect — so the form can offer
 * "Scan next sticker" instead of always leaving the page).
 */
export function OnboardFlow({
  token,
  equipmentTypes,
  customers,
  initialTypeId = "",
  initialCustomerId = "",
}: {
  token: string;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
  /** From ?type=/&customer= — the previous sticker's selections, carried over by the "Scan next sticker" loop (docs/QOL-CONTINUITY-BRIEF.md item 3 / Q-55). */
  initialTypeId?: string;
  initialCustomerId?: string;
}) {
  const [step, setStep] = useState<Step>("photo");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [fields, setFields] = useState<NameplateFields | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be picked twice in a row (e.g. after a failed read).
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
      setFields(body.fields as NameplateFields);
      setStep("form");
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : "Couldn't read that nameplate.");
    } finally {
      setScanning(false);
    }
  }

  if (step === "form") {
    return (
      <OnboardForm
        token={token}
        equipmentTypes={equipmentTypes}
        customers={customers}
        fields={fields}
        initialTypeId={initialTypeId}
        initialCustomerId={initialCustomerId}
        onRetakePhoto={() => {
          setFields(null);
          setScanError(null);
          setStep("photo");
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/e/${token}`}
        className="mb-4 inline-flex items-center gap-1 self-start text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Back
      </Link>
      <Card className="flex flex-1 flex-col justify-center">
        <CardHeader>
          <CardTitle>Photograph the nameplate</CardTitle>
          <CardDescription>
            We&apos;ll read the make, model and serial number off the data plate so you don&apos;t
            have to type them in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scanError && <p className="text-sm text-destructive">{scanError}</p>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhoto}
          />
          <Button
            size="lg"
            className="w-full"
            onClick={() => inputRef.current?.click()}
            disabled={scanning}
          >
            {scanning ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Reading nameplate...
              </>
            ) : (
              <>
                <Camera className="size-4" /> Take a photo
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setStep("form")}
            disabled={scanning}
          >
            Skip, fill in by hand
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function OnboardForm({
  token,
  equipmentTypes,
  customers,
  fields,
  initialTypeId,
  initialCustomerId,
  onRetakePhoto,
}: {
  token: string;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
  fields: NameplateFields | null;
  initialTypeId: string;
  initialCustomerId: string;
  onRetakePhoto: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(() =>
    [fields?.make, fields?.model].filter(Boolean).join(" ")
  );
  const [equipmentTypeId, setEquipmentTypeId] = useState(initialTypeId);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  // Types/customers created inline this session, so the combobox keeps
  // showing them without waiting on the server props to refresh — same
  // pattern as dashboard/equipment/new-equipment-dialog.tsx.
  const [extraTypes, setExtraTypes] = useState<ComboboxOption[]>([]);
  const [extraCustomers, setExtraCustomers] = useState<ComboboxOption[]>([]);
  // Set once onboardEquipment() succeeds — swaps the form for the "scan the
  // next one" screen instead of always navigating away (item 3 / Q-55).
  const [justCreated, setJustCreated] = useState<{ name: string } | null>(null);

  const readSomething = !!(fields && (fields.make || fields.model || fields.serial_number));
  const hasExtraFields = !!(fields?.voltage || fields?.year || fields?.other_notes);

  const typeOptions: ComboboxOption[] = [
    ...equipmentTypes.map((t) => ({ value: t.id, label: t.name })),
    ...extraTypes.filter((e) => !equipmentTypes.some((t) => t.id === e.value)),
  ];
  const customerOptions: ComboboxOption[] = [
    ...customers.map((c) => ({ value: c.id, label: c.name })),
    ...extraCustomers.filter((e) => !customers.some((c) => c.id === e.value)),
  ];

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

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const submittedName = String(formData.get("name") ?? "").trim();
    const result = await onboardEquipment(token, formData);
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setJustCreated({ name: submittedName });
  }

  // Scanning the next blank sticker navigates straight to its own onboard
  // page, carrying this sticker's type/customer along as a preselection —
  // the "keeps the selections" half of the loop (item 3 / Q-55). The unit
  // NAME is deliberately not carried: that's specific to each physical unit.
  function handleScanNext(code: string) {
    const params = new URLSearchParams();
    if (equipmentTypeId) params.set("type", equipmentTypeId);
    if (customerId) params.set("customer", customerId);
    const query = params.toString();
    router.push(`/e/${code}/onboard${query ? `?${query}` : ""}`);
  }

  if (justCreated) {
    return (
      <div className="flex flex-1 flex-col">
        <Card className="flex flex-1 flex-col justify-center">
          <CardHeader>
            <CardTitle>{justCreated.name || "Equipment"} added</CardTitle>
            <CardDescription>This sticker is now linked to it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QrScanButton onScan={handleScanNext} />
            <p className="text-sm text-muted-foreground">
              Scan the next blank sticker to add another unit — the type and customer you picked
              stay selected.
            </p>
            <Button
              render={<Link href={`/e/${token}`} />}
              nativeButton={false}
              variant="outline"
              className="w-full"
            >
              View this sticker instead
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        type="button"
        onClick={onRetakePhoto}
        className="mb-4 inline-flex items-center gap-1 self-start text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" /> Back
      </button>
      <Card>
        <CardHeader>
          <CardTitle>New equipment</CardTitle>
          <CardDescription>
            {readSomething
              ? `Read from the nameplate${fields?.confidence === "low" ? " — double-check these" : ""}.`
              : "Fill in what you know — you can add more later."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="name">Name / label</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Break room water heater"
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
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer (optional)</Label>
              <CreatableCombobox
                id="customerId"
                name="customerId"
                options={customerOptions}
                value={customerId}
                onChange={(value) => setCustomerId(value)}
                onCreate={handleCreateCustomer}
                placeholder="Search or create a customer…"
                emptyLabel="Type a name to add a new customer."
                createLabel={(q) => `Create customer "${q}"`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location within site (optional)</Label>
              <Input id="location" name="location" placeholder="e.g. Building A, Floor 2" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="make">Make (optional)</Label>
                <Input id="make" name="make" defaultValue={fields?.make ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model (optional)</Label>
                <Input id="model" name="model" defaultValue={fields?.model ?? ""} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial number (optional)</Label>
              <Input
                id="serialNumber"
                name="serialNumber"
                defaultValue={fields?.serial_number ?? ""}
              />
            </div>
            {hasExtraFields && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">Also on the nameplate</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="voltage">Voltage (optional)</Label>
                    <Input id="voltage" name="voltage" defaultValue={fields?.voltage ?? ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year (optional)</Label>
                    <Input id="year" name="year" defaultValue={fields?.year ?? ""} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="otherNotes">Other details (optional)</Label>
                  <Input id="otherNotes" name="otherNotes" defaultValue={fields?.other_notes ?? ""} />
                </div>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Adding..." : "Add equipment"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
