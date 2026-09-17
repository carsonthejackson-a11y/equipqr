"use client";

import { usePathname } from "next/navigation";
import { CodeEntryForm } from "@/components/public/code-entry-form";
import { PoweredBy } from "@/components/public/brand-shell";
import { formatShortCode, normalizeShortCode } from "@/lib/short-code";

/**
 * Renders wherever `notFound()` fires inside `/e/[qrToken]` — an unknown or
 * mistyped code (Q-06), whether from this segment's own page.tsx or a
 * deeper one (e.g. `/request`) that has no not-found.tsx of its own and so
 * bubbles up here. A client component so it can read the attempted code
 * back out of the URL with `usePathname()`: the not-found file convention
 * receives no params, and there's no code left to resolve server-side —
 * `resolve_qr_code()` already ran and came back empty.
 */
export default function EquipmentNotFound() {
  const pathname = usePathname();
  const attempted = pathname?.split("/")[2] ?? "";
  const normalized = normalizeShortCode(attempted);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-sm flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">
            {normalized
              ? `We couldn't find sticker ${formatShortCode(normalized)}`
              : "We couldn't find that sticker"}
          </h1>
          <p className="text-muted-foreground">
            Double-check the code under the QR code, or try again below.
          </p>
        </div>
        <CodeEntryForm defaultValue={normalized ?? ""} autoFocus />
      </main>
      <PoweredBy />
    </div>
  );
}
