import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import type { Location } from "@/lib/types";
import { PrintButton } from "./print-button";

/**
 * Print-friendly staff poster (docs/OWNER-ROADMAP-BRIEF.md §3.2): "scan the
 * tag, tell us what's wrong" instructions plus the location's staff PIN (if
 * one is set), meant to be taped up near the equipment. `print:` utility
 * classes only — no new dependency, matches the existing QR label sheet's
 * approach (src/app/dashboard/equipment/labels/label-sheet-builder.tsx).
 */
export default async function LocationPosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: location } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Location>();

  if (!location) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">Print this and post it near the equipment.</p>
        <PrintButton />
      </div>

      <div className="space-y-8 rounded-xl border p-10 text-center print:border-0 print:p-0">
        <Logo className="justify-center" />

        <div>
          <h1 className="text-3xl font-bold">Something wrong with the equipment?</h1>
          <p className="mt-2 text-lg text-muted-foreground">{location.name}</p>
        </div>

        <ol className="mx-auto max-w-md space-y-4 text-left text-lg">
          <li className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              1
            </span>
            <span>Scan the QR tag on the machine with your phone&apos;s camera.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              2
            </span>
            <span>Tap &ldquo;Report a problem&rdquo; and describe what&apos;s happening.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              3
            </span>
            <span>We&apos;ll send it straight to the right vendor.</span>
          </li>
        </ol>

        {location.site_pin && (
          <div className="mx-auto max-w-xs rounded-lg border-2 border-dashed p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Staff code
            </p>
            <p className="mt-1 font-mono text-5xl font-bold tracking-widest">{location.site_pin}</p>
            <p className="mt-1 text-sm text-muted-foreground">Enter this when the form asks for it.</p>
          </div>
        )}
      </div>
    </div>
  );
}
