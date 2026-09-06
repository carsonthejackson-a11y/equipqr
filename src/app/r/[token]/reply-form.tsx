"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SendHorizontal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MAX_CUSTOMER_MESSAGE_LENGTH } from "@/lib/customer-message";

// The one piece of the status page that needs JavaScript: a textarea and a
// Send button that POST to /api/request-messages. Deliberately plain — no
// optimistic insert, no local message list. On success the page is
// refreshed so the new message shows up in "Updates" from the same RPC that
// renders everything else, which keeps one source of truth and means a
// message that didn't actually land can never appear to have.

export function ReplyForm({ token, companyName }: { token: string; companyName: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const remaining = MAX_CUSTOMER_MESSAGE_LENGTH - body.length;
  const canSend = body.trim().length > 0 && !sending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    setError(null);
    setSent(false);
    setSending(true);

    try {
      const response = await fetch("/api/request-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, body }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean };

      if (!response.ok) {
        // 429 and 400 both carry a readable message from the server.
        throw new Error(json.error ?? "Something went wrong sending your message");
      }

      setBody("");
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {sent && !error && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          Sent — the team has been notified.
        </p>
      )}

      <div className="space-y-1">
        <label htmlFor="reply-body" className="sr-only">
          Your message to {companyName}
        </label>
        <Textarea
          id="reply-body"
          rows={3}
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, MAX_CUSTOMER_MESSAGE_LENGTH));
            if (sent) setSent(false);
          }}
          placeholder={`Anything ${companyName} should know? A gate code, a better time, a change in the problem…`}
          maxLength={MAX_CUSTOMER_MESSAGE_LENGTH}
          disabled={sending}
          className="min-h-24 rounded-xl px-4 py-3 text-base"
        />
        <p
          className={`text-right text-xs ${remaining < 100 ? "text-destructive" : "text-muted-foreground"}`}
          aria-live="polite"
        >
          {body.length}/{MAX_CUSTOMER_MESSAGE_LENGTH}
        </p>
      </div>

      <button
        type="submit"
        disabled={!canSend}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--brand)] px-4 text-base font-semibold text-[var(--brand-on)] transition-opacity hover:opacity-90 active:translate-y-px disabled:opacity-50"
      >
        <SendHorizontal className="size-5" aria-hidden />
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
