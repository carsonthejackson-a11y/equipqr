"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import type { GuideOption, GuideOutcome, GuideStep } from "@/lib/types";
import {
  createGuideOption,
  createGuideStep,
  deleteGuideOption,
  deleteGuideStep,
  setRootStep,
  updateGuideOption,
  updateGuideStep,
} from "../actions";

const OUTCOME_LABELS: Record<GuideOutcome, string> = {
  continue: "Continue to another step",
  resolved: "Mark resolved",
  escalate: "Escalate to service request",
};

function describeOption(option: GuideOption, stepsById: Map<string, GuideStep>) {
  if (option.outcome === "resolved") return "✓ Resolved";
  if (option.outcome === "escalate") return "→ Request service";
  const target = option.next_step_id ? stepsById.get(option.next_step_id) : null;
  return target ? `→ ${target.title}` : "⚠ Points to a deleted step";
}

export function GuideStepsEditor({
  equipmentTypeId,
  steps,
  options,
}: {
  equipmentTypeId: string;
  steps: GuideStep[];
  options: GuideOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<GuideStep | null>(null);
  const [addOptionForStep, setAddOptionForStep] = useState<GuideStep | null>(null);
  const [editingOption, setEditingOption] = useState<GuideOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepsById = new Map(steps.map((s) => [s.id, s]));
  const optionsByStep = new Map<string, GuideOption[]>();
  for (const option of options) {
    const list = optionsByStep.get(option.guide_step_id) ?? [];
    list.push(option);
    optionsByStep.set(option.guide_step_id, list);
  }

  async function handleAddStep(formData: FormData) {
    setError(null);
    const result = await createGuideStep(equipmentTypeId, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAddStepOpen(false);
  }

  async function handleEditStep(formData: FormData) {
    if (!editingStep) return;
    setError(null);
    const result = await updateGuideStep(editingStep.id, equipmentTypeId, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditingStep(null);
  }

  function handleDeleteStep(stepId: string) {
    if (!confirm("Delete this step? Any options pointing to it will need a new target.")) return;
    startTransition(async () => {
      const result = await deleteGuideStep(stepId, equipmentTypeId);
      if (result?.error) {
        alert(result.error);
      }
    });
  }

  function handleSetRoot(stepId: string) {
    startTransition(async () => {
      await setRootStep(stepId, equipmentTypeId);
    });
  }

  async function handleAddOption(formData: FormData) {
    if (!addOptionForStep) return;
    setError(null);
    const result = await createGuideOption(addOptionForStep.id, equipmentTypeId, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAddOptionForStep(null);
  }

  async function handleEditOption(formData: FormData) {
    if (!editingOption) return;
    setError(null);
    const result = await updateGuideOption(editingOption.id, equipmentTypeId, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditingOption(null);
  }

  function handleDeleteOption(optionId: string) {
    if (!confirm("Delete this option?")) return;
    startTransition(async () => {
      await deleteGuideOption(optionId, equipmentTypeId);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Troubleshooting guide</h2>
          <p className="text-sm text-muted-foreground">
            Each step can branch into a few short options. The step marked{" "}
            <Badge variant="outline">Start</Badge> is where customers begin.
          </p>
        </div>
        <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
          <DialogTrigger render={<Button size="sm">Add step</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add step</DialogTitle>
            </DialogHeader>
            <form action={handleAddStep} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g. What's the issue?"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions (optional)</Label>
                <Textarea
                  id="instructions"
                  name="instructions"
                  rows={3}
                  placeholder="What should the customer do or check?"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isRoot"
                  name="isRoot"
                  value="true"
                  defaultChecked={steps.length === 0}
                />
                <Label htmlFor="isRoot" className="font-normal">
                  Customers start here
                </Label>
              </div>
              <DialogFooter>
                <Button type="submit">Add step</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {steps.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          message="No steps yet. Add the first question or check a customer should see."
        />
      ) : (
        <div className="space-y-3">
          {steps.map((step) => (
            <Card key={step.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      {step.is_root && <Badge variant="outline">Start</Badge>}
                      <p className="font-medium">{step.title}</p>
                    </div>
                    {step.instructions && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {step.instructions}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!step.is_root && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleSetRoot(step.id)}
                      >
                        Set as start
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setEditingStep(step)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleDeleteStep(step.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
                  {(optionsByStep.get(step.id) ?? []).map((option) => (
                    <div
                      key={option.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{option.label}</span>{" "}
                        <span className="text-muted-foreground">
                          {describeOption(option, stepsById)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditingOption(option)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={isPending}
                          onClick={() => handleDeleteOption(option.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setAddOptionForStep(step)}
                  >
                    <Plus className="size-3.5" />
                    Add option
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit step */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit step</DialogTitle>
          </DialogHeader>
          {editingStep && (
            <form action={handleEditStep} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" name="title" defaultValue={editingStep.title} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-instructions">Instructions (optional)</Label>
                <Textarea
                  id="edit-instructions"
                  name="instructions"
                  rows={3}
                  defaultValue={editingStep.instructions ?? ""}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-isRoot"
                  name="isRoot"
                  value="true"
                  defaultChecked={editingStep.is_root}
                />
                <Label htmlFor="edit-isRoot" className="font-normal">
                  Customers start here
                </Label>
              </div>
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add option */}
      <Dialog open={!!addOptionForStep} onOpenChange={(open) => !open && setAddOptionForStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add option{addOptionForStep ? ` — ${addOptionForStep.title}` : ""}</DialogTitle>
          </DialogHeader>
          {addOptionForStep && (
            <OptionForm
              action={handleAddOption}
              steps={steps}
              currentStepId={addOptionForStep.id}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit option */}
      <Dialog open={!!editingOption} onOpenChange={(open) => !open && setEditingOption(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit option</DialogTitle>
          </DialogHeader>
          {editingOption && (
            <OptionForm
              action={handleEditOption}
              steps={steps}
              currentStepId={editingOption.guide_step_id}
              defaultOption={editingOption}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OptionForm({
  action,
  steps,
  currentStepId,
  defaultOption,
  error,
}: {
  action: (formData: FormData) => void;
  steps: GuideStep[];
  currentStepId: string;
  defaultOption?: GuideOption;
  error: string | null;
}) {
  const [outcome, setOutcome] = useState<GuideOutcome>(defaultOption?.outcome ?? "continue");
  const targetableSteps = steps.filter((s) => s.id !== currentStepId);

  return (
    <form action={action} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="label">Label</Label>
        <Input
          id="label"
          name="label"
          placeholder="e.g. Still leaking"
          defaultValue={defaultOption?.label}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="outcome">What happens next?</Label>
        <Select name="outcome" value={outcome} onValueChange={(v) => setOutcome(v as GuideOutcome)} items={OUTCOME_LABELS}>
          <SelectTrigger id="outcome" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(OUTCOME_LABELS) as GuideOutcome[]).map((value) => (
              <SelectItem key={value} value={value}>
                {OUTCOME_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {outcome === "continue" && (
        <div className="space-y-2">
          <Label htmlFor="nextStepId">Which step?</Label>
          <Select
            name="nextStepId"
            defaultValue={defaultOption?.next_step_id ?? undefined}
            items={Object.fromEntries(targetableSteps.map((s) => [s.id, s.title]))}
          >
            <SelectTrigger id="nextStepId" className="w-full">
              <SelectValue placeholder="Select a step" />
            </SelectTrigger>
            <SelectContent>
              {targetableSteps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <DialogFooter>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}
