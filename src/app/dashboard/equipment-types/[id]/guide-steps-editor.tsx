"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import type { GuideStep } from "@/lib/types";
import {
  createGuideStep,
  deleteGuideStep,
  moveGuideStep,
  updateGuideStep,
} from "../actions";

export function GuideStepsEditor({
  equipmentTypeId,
  steps,
}: {
  equipmentTypeId: string;
  steps: GuideStep[];
}) {
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<GuideStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextStepNumber =
    steps.length === 0 ? 1 : Math.max(...steps.map((s) => s.step_number)) + 1;

  async function handleAdd(formData: FormData) {
    setError(null);
    const result = await createGuideStep(equipmentTypeId, nextStepNumber, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setAddOpen(false);
  }

  async function handleEdit(formData: FormData) {
    if (!editingStep) return;
    setError(null);
    const result = await updateGuideStep(editingStep.id, equipmentTypeId, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setEditingStep(null);
  }

  function handleDelete(stepId: string) {
    if (!confirm("Delete this step?")) return;
    startTransition(async () => {
      await deleteGuideStep(stepId, equipmentTypeId);
    });
  }

  function handleMove(step: GuideStep, direction: "up" | "down") {
    startTransition(async () => {
      await moveGuideStep(equipmentTypeId, step.id, step.step_number, direction);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Troubleshooting steps</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button size="sm">Add step</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add step {nextStepNumber}</DialogTitle>
            </DialogHeader>
            <form action={handleAdd} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" placeholder="e.g. Check the power supply" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  id="instructions"
                  name="instructions"
                  rows={4}
                  placeholder="What should the customer do?"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit">Add step</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {steps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No steps yet. Add the first thing a customer should try.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {steps
            .slice()
            .sort((a, b) => a.step_number - b.step_number)
            .map((step, index) => (
              <Card key={step.id}>
                <CardContent className="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Step {index + 1}</p>
                    <p className="font-medium">{step.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {step.instructions}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending || index === 0}
                      onClick={() => handleMove(step, "up")}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending || index === steps.length - 1}
                      onClick={() => handleMove(step, "down")}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditingStep(step)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => handleDelete(step.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit step</DialogTitle>
          </DialogHeader>
          {editingStep && (
            <form action={handleEdit} className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input id="edit-title" name="title" defaultValue={editingStep.title} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-instructions">Instructions</Label>
                <Textarea
                  id="edit-instructions"
                  name="instructions"
                  rows={4}
                  defaultValue={editingStep.instructions}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
