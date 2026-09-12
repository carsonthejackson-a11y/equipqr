"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sitePinStorageKey } from "@/lib/public-request";
import { cn } from "@/lib/utils";

// The site-PIN keypad (docs/OWNER-ROADMAP-BRIEF.md §3.3.1/§7.3). Numeric
// only, no length hint beyond a 4-digit minimum to submit (the PIN itself is
// 4-8 digits at the DB layer, but the failure copy never says so — "That
// code didn't match" either way). The PIN itself never touches
// localStorage; only the opaque pass verify_site_pin() returns does.

const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const MAX_PIN_LENGTH = 8;

export function SitePinGate({
  qrToken,
  locationId,
  locationName,
  onVerified,
}: {
  qrToken: string;
  locationId: string;
  locationName: string | null;
  onVerified: (pass: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function press(digit: string) {
    setError(null);
    setPin((current) => (current.length >= MAX_PIN_LENGTH ? current : current + digit));
  }

  function backspace() {
    setError(null);
    setPin((current) => current.slice(0, -1));
  }

  async function handleSubmit() {
    if (pin.length < 4) {
      setError("Enter the code posted at this site");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/site-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken, pin }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        pass?: string | null;
      };

      if (!response.ok || !body.ok || !body.pass) {
        setError("That code didn't match");
        setPin("");
        return;
      }

      try {
        localStorage.setItem(sitePinStorageKey(locationId), body.pass);
      } catch {
        // Best effort — the submit route re-verifies the pass server-side
        // regardless, so a browser that blocks storage just re-prompts.
      }
      onVerified(body.pass);
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8 text-center">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Enter the site code</h1>
        <p className="text-muted-foreground">
          {locationName ? `Posted at ${locationName}` : "Posted at this location"}
        </p>
      </div>

      <div className="flex gap-2" aria-live="polite">
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "flex size-11 items-center justify-center rounded-lg border text-lg font-semibold",
              i < pin.length ? "border-[var(--brand)] bg-[var(--brand)]/10" : "bg-muted/30"
            )}
            aria-hidden
          >
            {pin[i] ? "•" : ""}
          </span>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {KEYPAD_DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => press(digit)}
            className="flex size-16 items-center justify-center rounded-full border text-xl font-semibold active:bg-muted"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={backspace}
          className="flex size-16 items-center justify-center rounded-full text-sm text-muted-foreground"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => press("0")}
          className="flex size-16 items-center justify-center rounded-full border text-xl font-semibold active:bg-muted"
        >
          0
        </button>
        <span aria-hidden />
      </div>

      <Button
        type="button"
        className="h-14 w-full max-w-xs bg-[var(--brand)] text-base font-semibold text-[var(--brand-on)] hover:opacity-90"
        disabled={submitting || pin.length < 4}
        onClick={handleSubmit}
      >
        {submitting ? "Checking…" : "Continue"}
      </Button>
    </div>
  );
}
