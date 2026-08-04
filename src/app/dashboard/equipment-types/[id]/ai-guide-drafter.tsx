"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GuideGraphNode } from "@/lib/types";
import { draftGuideWithAI, replaceGuideGraph } from "../actions";

function describeDraftOption(
  option: GuideGraphNode["options"][number],
  nodesByTempId: Map<string, GuideGraphNode>
) {
  if (option.outcome === "resolved") return "✓ Resolved";
  if (option.outcome === "escalate") return "→ Request service";
  const target = option.nextTempId ? nodesByTempId.get(option.nextTempId) : null;
  return target ? `→ ${target.title}` : "⚠ No target";
}

export function AiGuideDrafter({
  equipmentTypeId,
  defaultDescription,
  existingStepCount,
}: {
  equipmentTypeId: string;
  defaultDescription: string;
  existingStepCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftNodes, setDraftNodes] = useState<GuideGraphNode[] | null>(null);

  async function handleGenerate(formData: FormData) {
    setGenerating(true);
    setError(null);
    const result = await draftGuideWithAI(equipmentTypeId, formData);
    setGenerating(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDraftNodes(result.nodes);
  }

  async function handleAccept() {
    if (!draftNodes) return;
    if (
      existingStepCount > 0 &&
      !confirm(`This replaces your current ${existingStepCount}-step guide. Continue?`)
    ) {
      return;
    }

    setApplying(true);
    const result = await replaceGuideGraph(equipmentTypeId, draftNodes);
    setApplying(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Guide updated from AI draft");
    setDraftNodes(null);
    setOpen(false);
    router.refresh();
  }

  function handleDiscard() {
    setDraftNodes(null);
  }

  const nodesByTempId = new Map((draftNodes ?? []).map((n) => [n.tempId, n]));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Draft a guide with AI
        </CardTitle>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Get started
          </Button>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {!draftNodes ? (
            <form action={handleGenerate} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="description">Describe the equipment</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={2}
                  defaultValue={defaultDescription}
                  placeholder="e.g. Commercial tankless water heater, 50-gallon"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commonIssues">Common issues customers report (optional)</Label>
                <Textarea
                  id="commonIssues"
                  name="commonIssues"
                  rows={3}
                  placeholder="e.g. Not heating, leaking from the drain valve, pilot light won't stay lit..."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={generating}>
                  {generating ? "Generating..." : "Generate draft"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Review this draft, then use it to replace your current guide or discard it.
              </p>
              {draftNodes.map((node) => (
                <Card key={node.tempId} className="bg-muted/30">
                  <CardContent className="space-y-2 py-3">
                    <div className="flex items-center gap-2">
                      {node.isRoot && <Badge variant="outline">Start</Badge>}
                      <p className="font-medium">{node.title}</p>
                    </div>
                    {node.instructions && (
                      <p className="text-sm text-muted-foreground">{node.instructions}</p>
                    )}
                    <div className="space-y-1">
                      {node.options.map((option, i) => (
                        <p key={i} className="text-sm">
                          <span className="font-medium">{option.label}</span>{" "}
                          <span className="text-muted-foreground">
                            {describeDraftOption(option, nodesByTempId)}
                          </span>
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <div className="flex gap-2">
                <Button onClick={handleAccept} disabled={applying}>
                  {applying ? "Applying..." : "Use this draft"}
                </Button>
                <Button variant="outline" onClick={handleDiscard} disabled={applying}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
