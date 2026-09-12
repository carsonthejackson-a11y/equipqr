"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MapPin, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RESTAURANT_EQUIPMENT_TEMPLATES } from "@/lib/owner-templates";
import { createFirstLocation, finishOwnerSetup, seedRestaurantEquipmentTypes } from "./actions";

type Step = "location" | "equipment-types";

/**
 * Two-step owner first-run wizard (docs/OWNER-ROADMAP-BRIEF.md §3.2):
 * 1. Create the first location.
 * 2. Optionally seed the 12-type restaurant equipment catalogue.
 * dashboard/layout.tsx routes every owner-kind company here until
 * finishOwnerSetup() stamps companies.owner_setup_completed_at.
 */
export function OwnerSetupFlow({
  hasLocation,
  hasEquipmentTypes,
}: {
  hasLocation: boolean;
  hasEquipmentTypes: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(hasLocation ? "equipment-types" : "location");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [seeded, setSeeded] = useState<number | null>(hasEquipmentTypes ? 0 : null);

  async function handleCreateLocation(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await createFirstLocation(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.refresh();
    setStep("equipment-types");
  }

  async function handleSeed() {
    setSubmitting(true);
    setError(null);
    const result = await seedRestaurantEquipmentTypes();
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    const created = result.created ?? 0;
    setSeeded(created);
    toast.success(created > 0 ? `Added ${created} equipment types` : "Already up to date");
  }

  async function handleFinish() {
    setSubmitting(true);
    setError(null);
    const result = await finishOwnerSetup();
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-center gap-4 text-sm">
        <StepBadge active={step === "location"} done={step !== "location"} icon={MapPin} label="Location" />
        <div className="h-px w-8 bg-border" />
        <StepBadge
          active={step === "equipment-types"}
          done={false}
          icon={Wrench}
          label="Equipment types"
        />
      </div>

      {error && <p className="text-center text-sm text-destructive">{error}</p>}

      {step === "location" ? (
        <Card>
          <CardHeader>
            <CardTitle>Add your first location</CardTitle>
            <CardDescription>
              A location is a site — a restaurant, café or shop — where your equipment lives.
              You can add more later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleCreateLocation} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Location name</Label>
                <Input id="name" name="name" placeholder="e.g. Main Street location" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address (optional)</Label>
                <Input id="address" name="address" placeholder="123 Main St, City, ST 00000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" name="phone" type="tel" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Creating..." : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Add the standard restaurant equipment types</CardTitle>
            <CardDescription>
              {RESTAURANT_EQUIPMENT_TEMPLATES.length} common types — dish machine, reach-in cooler,
              ice machine and more — each with the quick-pick problem chips staff see on the scan
              form. You can rename, remove or add to these any time from Equipment Types.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {RESTAURANT_EQUIPMENT_TEMPLATES.map((t) => (
                <li key={t.name}>{t.name}</li>
              ))}
            </ul>

            {seeded !== null ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                <Check className="size-4" />
                {seeded > 0 ? `Added ${seeded} equipment types.` : "These are already set up."}
              </p>
            ) : (
              <Button type="button" variant="outline" onClick={handleSeed} disabled={submitting}>
                {submitting ? "Adding..." : "Add these equipment types"}
              </Button>
            )}

            <Button type="button" className="w-full" onClick={handleFinish} disabled={submitting}>
              {submitting ? "Finishing..." : seeded !== null ? "Go to dashboard" : "Skip and go to dashboard"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepBadge({
  active,
  done,
  icon: Icon,
  label,
}: {
  active: boolean;
  done: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className={active ? "flex items-center gap-1.5 font-medium text-foreground" : "flex items-center gap-1.5 text-muted-foreground"}>
      <span
        className={
          done
            ? "flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
            : active
              ? "flex size-6 items-center justify-center rounded-full border-2 border-primary"
              : "flex size-6 items-center justify-center rounded-full border"
        }
      >
        {done ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      {label}
    </div>
  );
}
