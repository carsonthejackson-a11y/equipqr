import Link from "next/link";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

/**
 * Q-15: escalates visually inside the last 3 days, and reads differently for
 * an owner (who can act) versus everyone else (who can't touch billing —
 * settings/billing/page.tsx and this app's other billing surfaces are all
 * owner-gated). companyKind isn't a prop here on purpose: the caller
 * (src/app/dashboard/layout.tsx) already only renders this component when
 * trialDaysLeft is non-null, which it never is for an equipment_owner
 * company (docs/OWNER-ROADMAP-BRIEF.md §9 Q1) — gating twice would just be
 * dead code in this file.
 */
export function TrialBanner({ daysLeft, role }: { daysLeft: number; role: UserRole }) {
  const urgent = daysLeft <= 3;
  const isOwner = role === "owner";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b px-4 py-2 text-center text-sm print:hidden",
        urgent ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-muted/40"
      )}
    >
      <span className={urgent ? "font-medium" : undefined}>
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your trial.
      </span>
      {isOwner ? (
        <Link href="/dashboard/settings/billing" className="font-medium underline underline-offset-2">
          Choose a plan
        </Link>
      ) : (
        <span className="font-medium">Ask your account owner to choose a plan.</span>
      )}
    </div>
  );
}
