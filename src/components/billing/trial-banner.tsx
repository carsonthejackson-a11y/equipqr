import Link from "next/link";
import type { CompanyKind } from "@/lib/types";

export function TrialBanner({
  daysLeft,
  companyKind,
}: {
  daysLeft: number;
  /**
   * equipment_owner companies are never locked and always have a Free tier
   * to land on, so a trial countdown nudging them to "choose a plan" is
   * misleading urgency they don't have (docs/OWNER-ROADMAP-BRIEF.md §9 Q1,
   * §3.4). Optional so a caller that predates this prop still compiles and
   * behaves exactly as before — see this build's report for the
   * dashboard/layout.tsx change that wires it up.
   */
  companyKind?: CompanyKind;
}) {
  if (companyKind === "equipment_owner") return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b bg-muted/40 px-4 py-2 text-center text-sm print:hidden">
      <span>
        {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your trial.
      </span>
      <Link href="/dashboard/settings/billing" className="font-medium underline underline-offset-2">
        Choose a plan
      </Link>
    </div>
  );
}
