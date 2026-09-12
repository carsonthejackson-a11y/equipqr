"use client";

import { Wrench, Store } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { CompanyKind } from "@/lib/types";

/**
 * Sign-up / onboarding kind picker (docs/OWNER-ROADMAP-BRIEF.md §3.2.1) —
 * shared by the sign-up form and the fallback /onboarding page so the copy
 * and layout never drift between the two places a new company can be
 * created.
 */
export function KindStep({
  value,
  onChange,
}: {
  value: CompanyKind;
  onChange: (kind: CompanyKind) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>What kind of company is this?</Label>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as CompanyKind)}
        className="grid gap-2 sm:grid-cols-2"
      >
        <label
          htmlFor="kind-provider"
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
            value === "service_provider" ? "border-primary bg-accent/50" : "hover:bg-accent/30"
          )}
        >
          <RadioGroupItem value="service_provider" id="kind-provider" className="mt-0.5" />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Wrench className="size-4" />I service equipment for customers
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              You run a repair or service business. Tag your customers&apos; equipment and take
              in work requests.
            </span>
          </span>
        </label>
        <label
          htmlFor="kind-owner"
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors",
            value === "equipment_owner" ? "border-primary bg-accent/50" : "hover:bg-accent/30"
          )}
        >
          <RadioGroupItem value="equipment_owner" id="kind-owner" className="mt-0.5" />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Store className="size-4" />I own equipment that other people service
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              You run a restaurant, café, bar or shop. Tag your own equipment so any staff
              member can send a work order to the right vendor.
            </span>
          </span>
        </label>
      </RadioGroup>
    </div>
  );
}
