import Link from "next/link";

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
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
