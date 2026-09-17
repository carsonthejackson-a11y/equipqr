"use client";

import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { QrScanButton } from "@/components/qr-scan-button";
import { Button } from "@/components/ui/button";
import { normalizeShortCode } from "@/lib/short-code";

/**
 * Q-50: a compact, icon-only Scan trigger for the mobile dashboard header —
 * opens the camera (via the shared QrScanButton dialog) and routes straight
 * to the public scan page for whatever sticker was in frame, the same page
 * a customer's own phone lands on. Lets staff jump to a unit's guide/history
 * without hunting for it in Equipment. 44px target per the field-ergonomics
 * rule (docs/QOL-CONTINUITY-BRIEF.md §1.5).
 */
export function DashboardScanButton() {
  const router = useRouter();

  return (
    <QrScanButton
      // An 8-character short code is normalized ("abcd-2345" → "ABCD2345");
      // anything else (a legacy lowercase 24-hex token) passes through as-is,
      // since uppercasing it would stop it resolving.
      onScan={(code) => router.push(`/e/${encodeURIComponent(normalizeShortCode(code) ?? code.trim())}`)}
      trigger={
        <Button type="button" variant="outline" size="icon" className="size-11" aria-label="Scan QR code">
          <ScanLine className="size-5" />
        </Button>
      }
    />
  );
}
