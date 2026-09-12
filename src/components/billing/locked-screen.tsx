import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyKind } from "@/lib/types";

export function LockedScreen({
  isOwner,
  companyKind,
}: {
  isOwner: boolean;
  /**
   * equipment_owner companies always have a free tier to fall back to and
   * are never locked (docs/OWNER-ROADMAP-BRIEF.md §9 Q1) — this is a
   * defensive guard, not the primary control: dashboard/layout.tsx already
   * never renders LockedScreen for that kind, because
   * get_company_entitlements() hard-codes is_locked=false for it. Optional
   * so a caller that predates this prop still compiles unchanged.
   */
  companyKind?: CompanyKind;
}) {
  if (companyKind === "equipment_owner") return null;

  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Your trial has ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {isOwner
              ? "Choose a plan to keep managing equipment, guides, and service requests."
              : "Your company's trial has ended. Ask your account owner to choose a plan to keep going."}
          </p>
          {isOwner && (
            <Button render={<Link href="/dashboard/settings/billing" />} nativeButton={false}>
              Choose a plan
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
