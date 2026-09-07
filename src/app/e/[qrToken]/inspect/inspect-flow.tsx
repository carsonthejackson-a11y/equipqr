"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, ChevronLeft, ClipboardList, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { createClient } from "@/lib/supabase/client";
import { validateResponses } from "@/lib/checklists";
import type { ChecklistTemplate, Inspection, InspectionItem } from "@/lib/types";
import { InspectionItemCard } from "./inspection-item-card";
import { completeInspection, createFollowUpRequest, saveInspectionItems, startInspection } from "./actions";

type Step = "pick" | "run" | "signoff" | "done";

/** Debounced autosave: waits for a pause in edits before writing, so typing a
 *  number reading doesn't fire a request per keystroke, while a dropped
 *  connection still loses at most a moment of work. */
function useAutosave(inspectionId: string | null, items: InspectionItem[]) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!inspectionId) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      saveInspectionItems(inspectionId, items).catch(() => {
        // Best-effort — the next edit (or the flush before signoff) retries.
      });
    }, 600);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [inspectionId, items]);

  return useCallback(async () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!inspectionId) return;
    await saveInspectionItems(inspectionId, items);
  }, [inspectionId, items]);
}

export function InspectFlow({
  qrToken,
  companyId,
  equipmentId,
  equipmentName,
  templates,
  serviceRequestId,
}: {
  qrToken: string;
  companyId: string;
  equipmentId: string;
  equipmentName: string;
  templates: ChecklistTemplate[];
  serviceRequestId: string | null;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [starting, setStarting] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);

  const [summary, setSummary] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [signaturePad, setSignaturePad] = useState<SignaturePadHandle | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [failedCount, setFailedCount] = useState(0);
  const [failedLabels, setFailedLabels] = useState<string[]>([]);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [followUp, setFollowUp] = useState<{ requestId: string } | null>(null);

  const flush = useAutosave(inspection?.id ?? null, items);

  function updateItem(id: string, next: InspectionItem) {
    setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
  }

  async function handlePickTemplate(template: ChecklistTemplate) {
    setStarting(template.id);
    setPickError(null);
    const result = await startInspection({
      equipmentId,
      templateId: template.id,
      serviceRequestId,
    });
    setStarting(null);

    if ("error" in result) {
      setPickError(result.error);
      return;
    }

    setInspection(result.inspection);
    setItems(result.inspection.items);
    setStep("run");
  }

  async function handleContinueToSignoff() {
    await flush();
    setStep("signoff");
  }

  async function handleComplete() {
    if (!inspection) return;
    setCompleteError(null);

    const validation = validateResponses(items);
    if (!validation.valid) {
      setCompleteError(`Answer these required items first: ${validation.missingLabels.join(", ")}`);
      setStep("run");
      return;
    }

    setCompleting(true);
    await flush();

    let signaturePath: string | null = null;
    try {
      if (signaturePad && !signaturePad.isEmpty()) {
        const blob = await signaturePad.toBlob();
        if (blob) {
          const path = `${companyId}/inspections/${inspection.id}/signature.png`;
          const supabase = createClient();
          const { error } = await supabase.storage
            .from("equipment-files")
            .upload(path, blob, { contentType: "image/png", upsert: true });
          if (error) throw new Error(error.message);
          signaturePath = path;
        }
      }
    } catch (cause) {
      setCompleting(false);
      setCompleteError(cause instanceof Error ? cause.message : "Couldn't save the signature.");
      return;
    }

    const result = await completeInspection({
      inspectionId: inspection.id,
      summary,
      signedByName: signedByName.trim() || null,
      signaturePath,
    });
    setCompleting(false);

    if ("error" in result) {
      setCompleteError(result.error);
      return;
    }

    setFailedCount(result.failedCount);
    setFailedLabels(result.failedLabels);
    setStep("done");
  }

  async function handleCreateFollowUp() {
    if (!inspection) return;
    setCreatingRequest(true);
    const result = await createFollowUpRequest(inspection.id);
    setCreatingRequest(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setFollowUp({ requestId: result.requestId });
    toast.success("Service request created");
  }

  if (step === "pick") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div>
          <Link
            href={`/e/${qrToken}`}
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Back to sticker
          </Link>
          <h1 className="text-xl font-semibold">Start an inspection</h1>
          <p className="text-muted-foreground">{equipmentName}</p>
        </div>

        {pickError && <p className="text-sm text-destructive">{pickError}</p>}

        {templates.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            message="No checklists apply to this equipment yet. Create one in Checklists on the dashboard."
          />
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handlePickTemplate(template)}
                disabled={!!starting}
                className="min-h-14 w-full rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <p className="font-medium">{template.name}</p>
                <p className="text-sm text-muted-foreground">
                  {template.items.length} item{template.items.length === 1 ? "" : "s"}
                  {template.description ? ` · ${template.description}` : ""}
                </p>
                {starting === template.id && <p className="mt-1 text-sm text-muted-foreground">Starting…</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === "run") {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{inspection?.template_name}</h1>
          <p className="text-muted-foreground">{equipmentName}</p>
        </div>

        {completeError && <p className="text-sm text-destructive">{completeError}</p>}

        <div className="space-y-3">
          {items.map((item) => (
            <InspectionItemCard
              key={item.id}
              item={item}
              companyId={companyId}
              inspectionId={inspection!.id}
              onChange={(next) => updateItem(item.id, next)}
            />
          ))}
        </div>

        <Button type="button" size="lg" className="min-h-14 text-base" onClick={handleContinueToSignoff}>
          Continue
        </Button>
      </div>
    );
  }

  if (step === "signoff") {
    return (
      <div className="flex flex-1 flex-col gap-4 pb-4">
        <div>
          <h1 className="text-xl font-semibold">Wrap up</h1>
          <p className="text-muted-foreground">{inspection?.template_name}</p>
        </div>

        {completeError && <p className="text-sm text-destructive">{completeError}</p>}

        <div className="space-y-1.5">
          <label htmlFor="inspection-summary" className="text-sm font-medium">
            Summary (optional)
          </label>
          <Textarea
            id="inspection-summary"
            rows={3}
            className="text-base"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Anything the office should know about this visit…"
          />
        </div>

        <Card>
          <CardContent className="space-y-3 py-4">
            <p className="text-sm font-medium">Customer sign-off (optional)</p>
            <SignaturePad onReady={setSignaturePad} onChange={setSignatureEmpty} />
            {!signatureEmpty && (
              <div className="space-y-1.5">
                <label htmlFor="signed-by" className="text-sm font-medium">
                  Signed by
                </label>
                <Input
                  id="signed-by"
                  className="min-h-14 text-base"
                  value={signedByName}
                  onChange={(e) => setSignedByName(e.target.value)}
                  placeholder="Customer's name"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-14" onClick={() => setStep("run")}>
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <Button
            type="button"
            className="min-h-14 flex-1 text-base"
            onClick={handleComplete}
            disabled={completing}
          >
            {completing ? "Completing…" : "Complete inspection"}
          </Button>
        </div>
      </div>
    );
  }

  // step === "done"
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        {failedCount === 0 ? (
          <CheckCircle2 className="size-12 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="size-12 text-destructive" aria-hidden />
        )}
        <h1 className="text-xl font-semibold">
          {failedCount === 0 ? "All clear" : `${failedCount} item${failedCount === 1 ? "" : "s"} failed`}
        </h1>
        {failedCount > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {failedLabels.map((label) => (
              <Badge key={label} variant="destructive">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {failedCount > 0 && !followUp && (
        <Button type="button" size="lg" className="min-h-14 text-base" onClick={handleCreateFollowUp} disabled={creatingRequest}>
          {creatingRequest ? "Creating…" : `Create a service request for ${failedCount} failed item${failedCount === 1 ? "" : "s"}`}
        </Button>
      )}
      {followUp && <p className="text-center text-sm text-muted-foreground">Service request created.</p>}

      <Button type="button" variant="outline" size="lg" className="min-h-14" nativeButton={false} render={<Link href={`/e/${qrToken}`} />}>
        Back to sticker
      </Button>
    </div>
  );
}
