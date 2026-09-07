"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  MAX_MESSAGE_LENGTH,
  MIN_MESSAGE_LENGTH,
  requestUpdateAuthorStorageKey,
} from "@/lib/public-request";

// The two-way messaging composer on /r/<token> (Next roadmap, migration
// 0019): a customer checking on a request can add a note instead of calling
// or filing a second request. Posts to POST /api/request-updates, which
// rate-limits, validates and calls add_customer_request_update() through the
// admin client so staff get emailed.
//
// Contact phone/email are always optional and collapsed by default —
// get_request_status() doesn't say whether the original request already has
// them, and add_customer_request_update() only fills in whichever is
// missing, so asking again here never overwrites what the requester gave.

/**
 * Lazy useState initializer rather than an effect: this is a one-time read of
 * an external store that has nothing to do with props, so there's no
 * "synchronize state via effect" going on — just an initial value. Guarded
 * for the server render (no `window`) and for browsers that throw on
 * localStorage access (private mode, locked-down policy); either way it's
 * fine for the field to start blank.
 */
function loadStoredName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(requestUpdateAuthorStorageKey()) ?? "";
  } catch {
    return "";
  }
}

export function MessageComposer({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState(loadStoredName);
  const [body, setBody] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedBody = body.trim();

    if (!trimmedName) {
      setError("Please enter your name");
      return;
    }
    if (trimmedBody.length < MIN_MESSAGE_LENGTH) {
      setError("Please write a bit more");
      return;
    }
    if (trimmedBody.length > MAX_MESSAGE_LENGTH) {
      setError("That's too long — please shorten it");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/request-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          body: trimmedBody,
          authorName: trimmedName,
          contactPhone: phone.trim(),
          contactEmail: email.trim(),
          website: honeypot,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Something went wrong sending that");
      }

      try {
        localStorage.setItem(requestUpdateAuthorStorageKey(), trimmedName);
      } catch {
        // Best effort — the field just won't be pre-filled next time.
      }

      setBody("");
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Add a note</h2>

      {sent && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          <Check className="size-4 shrink-0" aria-hidden />
          Sent — we&apos;ll get back to you.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Honeypot: invisible to a real customer, but a form-filling bot
            populates every field it sees. A non-empty value here makes the
            API route silently no-op. */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />

        <div className="space-y-1.5">
          <Label htmlFor="composer-name">Your name</Label>
          <Input
            id="composer-name"
            className="h-11 text-base"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="composer-body">Message</Label>
          <Textarea
            id="composer-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Any update, or a question for the tech…"
            maxLength={MAX_MESSAGE_LENGTH}
            required
          />
        </div>

        <button
          type="button"
          onClick={() => setShowContact((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-muted-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", showContact && "rotate-180")} aria-hidden />
          {showContact ? "Hide contact info" : "Add contact info"}
        </button>

        {showContact && (
          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">
              Only used if the request doesn&apos;t already have one on file.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="composer-phone">Best phone for updates</Label>
              <Input
                id="composer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 text-base"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="composer-email">Best email for updates</Label>
              <Input
                id="composer-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                className="h-11 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
        )}

        <Button type="submit" disabled={submitting} className="h-12 w-full text-base font-semibold">
          {submitting ? "Sending…" : "Send"}
        </Button>
      </form>
    </section>
  );
}
