"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downscaleToJpeg, blobToBase64 } from "@/lib/client-image";
import type { Customer, EquipmentType } from "@/lib/types";
import { onboardEquipment } from "../actions";

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
 * this code to it, redirects to the staff scan view).
 */
export function OnboardFlow({
  token,
  equipmentTypes,
  customers,
}: {
  token: string;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
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
  onRetakePhoto,
}: {
  token: string;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
  fields: NameplateFields | null;
  onRetakePhoto: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(() =>
    [fields?.make, fields?.model].filter(Boolean).join(" ")
  );
  const [customerId, setCustomerId] = useState("");

  const noTypes = equipmentTypes.length === 0;
  const readSomething = !!(fields && (fields.make || fields.model || fields.serial_number));
  const hasExtraFields = !!(fields?.voltage || fields?.year || fields?.other_notes);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    // On success this redirects to /e/<token> and never returns — nothing
    // more to do here. An {error} means it didn't, so surface it and let the
    // technician fix the form.
    const result = await onboardEquipment(token, formData);
    setSubmitting(false);
    if (result?.error) {
      setError(result.error);
    }
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
          {noTypes ? (
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any equipment types yet.{" "}
              <Link href="/dashboard/equipment-types" className="underline underline-offset-2">
                Create one
              </Link>{" "}
              first, then come back and scan this sticker again.
            </p>
          ) : (
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
                <Select
                  name="equipmentTypeId"
                  items={Object.fromEntries(equipmentTypes.map((t) => [t.id, t.name]))}
                  required
                >
                  <SelectTrigger id="equipmentTypeId" className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipmentTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerId">Customer (optional)</Label>
                <Select
                  name="customerId"
                  value={customerId}
                  onValueChange={(v) => setCustomerId(v ?? "")}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
