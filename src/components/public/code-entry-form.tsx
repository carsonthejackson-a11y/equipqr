"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeShortCode } from "@/lib/short-code";

/**
 * The large sticker-code input shared by `/e` (Q-06) and the
 * `/e/[qrToken]/not-found` page — typing a code by hand off a scuffed
 * sticker should work the same way whether the visitor started here blank
 * or landed here after a typo.
 *
 * Purely client-side: `normalizeShortCode()` plus a route push, with no
 * request of its own. That's deliberate, not an oversight — there is
 * nothing here to rate-limit or that could expose more than `/e/<code>`
 * (the page this always lands on) already does, since this component never
 * calls the network. A wrong code just 404s the same way typing the URL
 * directly always has.
 */
export function CodeEntryForm({
  defaultValue = "",
  autoFocus = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeShortCode(value);
    if (!normalized) {
      setError("That doesn't look like a full code — check the sticker and try again.");
      return;
    }
    router.push(`/e/${normalized}`);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full space-y-3">
      <div className="space-y-2">
        <Label htmlFor="sticker-code" className="block text-center text-base">
          Sticker code
        </Label>
        <Input
          id="sticker-code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase());
            setError(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD-2345"
          maxLength={16}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={error ? "sticker-code-error" : undefined}
          className="h-16 text-center text-2xl font-semibold tracking-[0.25em]"
        />
        {error && (
          <p id="sticker-code-error" role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="h-14 w-full text-base font-semibold">
        Find my sticker
        <ArrowRight className="size-5" aria-hidden />
      </Button>
    </form>
  );
}
