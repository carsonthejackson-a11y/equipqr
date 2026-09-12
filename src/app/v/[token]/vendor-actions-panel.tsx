"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Clock, FileText, MessageSquare, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { zonedWallTimeToUtcIso } from "@/lib/schedule";
import { isVendorActionable } from "@/lib/dispatch";
import type { DispatchStatus } from "@/lib/types";

// The six buttons behind /v/<token> (docs/OWNER-ROADMAP-BRIEF.md §3.3.6).
// No login, no app — every action is one POST to /api/vendor-actions (or,
// for the invoice, /api/vendor-invoice) keyed on the dispatch token in the
// URL. State here is optimistic-ish: on success we trust the server's
// returned status rather than guessing it locally, but a decline/finish
// doesn't force a full page reload — the read-only summary below renders
// from local state so the vendor sees the outcome immediately even though a
// hard refresh of a *declined* dispatch would now 404 (declined dispatches
// are closed at the RPC layer — see get_vendor_dispatch's P0001 rule).

type PanelState = {
  status: DispatchStatus;
  etaAt: string | null;
  declineReason: string | null;
};

async function postVendorAction(
  token: string,
  body: Record<string, unknown>
): Promise<{ status: DispatchStatus; action: string; etaAt: string | null }> {
  const res = await fetch("/api/vendor-actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<{
    status: DispatchStatus;
    action: string;
    etaAt: string | null;
  }>;
  if (!res.ok || !data.status) {
    throw new Error(data.error ?? "Something went wrong");
  }
  return { status: data.status, action: data.action ?? "", etaAt: data.etaAt ?? null };
}

export function VendorActionsPanel({
  token,
  vendorName,
  timeZone,
  initialStatus,
  initialEtaAt,
}: {
  token: string;
  vendorName: string;
  timeZone: string;
  initialStatus: DispatchStatus;
  initialEtaAt: string | null;
}) {
  const [state, setState] = useState<PanelState>({
    status: initialStatus,
    etaAt: initialEtaAt,
    declineReason: null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [etaTime, setEtaTime] = useState("");
  const [showEta, setShowEta] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReasonInput, setDeclineReasonInput] = useState("");
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [invoiceAttached, setInvoiceAttached] = useState(false);

  async function withBusy(key: string, run: () => Promise<void>) {
    setBusy(key);
    try {
      await run();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function handleAcknowledge() {
    void withBusy("acknowledge", async () => {
      const result = await postVendorAction(token, { action: "acknowledge" });
      setState((s) => ({ ...s, status: result.status }));
      toast.success("Marked as acknowledged");
    });
  }

  function handleEtaSubmit() {
    if (!etaDate || !etaTime) {
      toast.error("Pick a date and time");
      return;
    }
    void withBusy("eta", async () => {
      const etaIso = zonedWallTimeToUtcIso(etaDate, etaTime, timeZone);
      const result = await postVendorAction(token, { action: "eta", etaAt: etaIso });
      setState((s) => ({ ...s, status: result.status, etaAt: result.etaAt }));
      setShowEta(false);
      toast.success("ETA sent");
    });
  }

  function handleNoteSubmit() {
    if (noteBody.trim().length < 2) {
      toast.error("Add a bit more detail");
      return;
    }
    void withBusy("note", async () => {
      await postVendorAction(token, { action: "note", body: noteBody.trim() });
      setNoteBody("");
      toast.success("Note added");
    });
  }

  function handleFinish() {
    void withBusy("finish", async () => {
      const result = await postVendorAction(token, { action: "finish" });
      setState((s) => ({ ...s, status: result.status }));
      toast.success("Marked finished");
    });
  }

  function handleDeclineSubmit() {
    if (declineReasonInput.trim().length < 2) {
      toast.error("Add a reason");
      return;
    }
    const reason = declineReasonInput.trim();
    void withBusy("decline", async () => {
      const result = await postVendorAction(token, { action: "decline", reason });
      setState({ status: result.status, etaAt: null, declineReason: reason });
      toast.success("Declined");
    });
  }

  async function handleInvoiceSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setInvoiceUploading(true);
    try {
      const form = new FormData();
      form.set("token", token);
      form.set("file", file);
      const res = await fetch("/api/vendor-invoice", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't upload that file");
      setInvoiceAttached(true);
      toast.success("Invoice attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setInvoiceUploading(false);
    }
  }

  if (!isVendorActionable(state.status)) {
    return (
      <div className="rounded-xl border bg-muted/40 px-4 py-4 text-center">
        <p className="font-medium">
          {state.status === "declined"
            ? `${vendorName} declined this work order`
            : "This work order is marked finished"}
        </p>
        {state.declineReason && (
          <p className="mt-1 text-sm text-muted-foreground">{state.declineReason}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          className="col-span-2 min-h-[52px]"
          disabled={busy !== null}
          onClick={handleAcknowledge}
        >
          <CheckCircle2 className="size-5" aria-hidden />
          Got it, we&apos;re scheduling
        </Button>

        <Button
          type="button"
          variant="outline"
          className="min-h-[52px]"
          disabled={busy !== null}
          onClick={() => setShowEta((v) => !v)}
        >
          <Clock className="size-5" aria-hidden />
          Here&apos;s our ETA
        </Button>

        <Button type="button" variant="outline" className="min-h-[52px]" disabled={busy !== null} onClick={handleFinish}>
          <CheckCircle2 className="size-5" aria-hidden />
          Finished
        </Button>
      </div>

      {showEta && (
        <div className="space-y-2 rounded-xl border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="eta-date">Date</Label>
              <Input id="eta-date" type="date" value={etaDate} onChange={(e) => setEtaDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="eta-time">Time</Label>
              <Input id="eta-time" type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)} />
            </div>
          </div>
          <Button type="button" size="sm" disabled={busy !== null} onClick={handleEtaSubmit}>
            Send ETA
          </Button>
        </div>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <Label htmlFor="vendor-note" className="flex items-center gap-1.5">
          <MessageSquare className="size-4" aria-hidden /> Add a note
        </Label>
        <Textarea
          id="vendor-note"
          rows={2}
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          maxLength={2000}
        />
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={handleNoteSubmit}>
          Send note
        </Button>
      </div>

      <div className="space-y-2 rounded-xl border p-3">
        <Label htmlFor="vendor-invoice" className="flex items-center gap-1.5">
          <FileText className="size-4" aria-hidden /> Attach invoice
        </Label>
        <input
          id="vendor-invoice"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="block w-full text-sm"
          disabled={invoiceUploading}
          onChange={(e) => {
            void handleInvoiceSelected(e.target.files);
          }}
        />
        {invoiceUploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
        {invoiceAttached && <p className="text-sm text-emerald-700 dark:text-emerald-400">Invoice attached.</p>}
      </div>

      {!showDecline ? (
        <button
          type="button"
          className="w-full py-2 text-center text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowDecline(true)}
        >
          This isn&apos;t ours
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-destructive/30 p-3">
          <Label htmlFor="decline-reason" className="flex items-center gap-1.5 text-destructive">
            <XCircle className="size-4" aria-hidden /> Why isn&apos;t this yours?
          </Label>
          <Textarea
            id="decline-reason"
            rows={2}
            value={declineReasonInput}
            onChange={(e) => setDeclineReasonInput(e.target.value)}
            maxLength={500}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={handleDeclineSubmit}
            >
              Decline this work order
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowDecline(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
