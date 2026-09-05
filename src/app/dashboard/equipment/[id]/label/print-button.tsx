"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markLabelPrinted } from "../qr-actions";

/**
 * Opens the browser print dialog and, when it knows which code is on the page,
 * stamps `qr_codes.label_printed_at` so the label-sheet builder can show which
 * units have never had a sticker printed.
 *
 * Both props are optional because the parked batch-QR admin sheet
 * (src/app/admin/qr-codes/print/page.tsx) renders this button for a page full
 * of unclaimed codes that belong to no single unit. See docs/BATCH-QR.md.
 */
export function PrintButton({
  codeId,
  equipmentId,
}: {
  codeId?: string;
  equipmentId?: string;
}) {
  const [, startTransition] = useTransition();

  function handleClick() {
    // Print first: window.print() blocks, and the stamp is bookkeeping the
    // user should never wait on. A failed stamp is logged server-side and
    // deliberately not surfaced — there's nothing for them to do about it.
    window.print();

    if (codeId) {
      startTransition(async () => {
        await markLabelPrinted([codeId], equipmentId);
      });
    }
  }

  return (
    <Button onClick={handleClick} className="print:hidden">
      Print
    </Button>
  );
}
