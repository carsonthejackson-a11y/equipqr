"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { CHECKLIST_ITEM_KIND_LABELS, emptyChecklistItem, newItemId } from "@/lib/checklists";
import type { ChecklistItem, ChecklistItemKind, ChecklistTemplate, EquipmentType } from "@/lib/types";
import {
  createChecklistTemplate,
  deleteChecklistTemplate,
  generateChecklistDraftAction,
  setChecklistTemplateActive,
  updateChecklistTemplate,
} from "./actions";

function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function ItemRow({
  item,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  item: ChecklistItem;
  index: number;
  count: number;
  onChange: (patch: Partial<ChecklistItem>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="space-y-3 py-3">
        <div className="flex items-start gap-2">
          <GripVertical className="mt-2.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="flex-1 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor={`label-${item.id}`}>Label</Label>
                <Input
                  id={`label-${item.id}`}
                  value={item.label}
                  onChange={(e) => onChange({ label: e.target.value })}
                  placeholder="e.g. Descale boiler"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`kind-${item.id}`}>Type</Label>
                <Select
                  value={item.kind}
                  onValueChange={(value) => onChange({ kind: value as ChecklistItemKind })}
                  items={CHECKLIST_ITEM_KIND_LABELS}
                >
                  <SelectTrigger id={`kind-${item.id}`} className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CHECKLIST_ITEM_KIND_LABELS) as ChecklistItemKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {CHECKLIST_ITEM_KIND_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`help-${item.id}`}>Help text (optional)</Label>
              <Input
                id={`help-${item.id}`}
                value={item.help ?? ""}
                onChange={(e) => onChange({ help: e.target.value || null })}
                placeholder="A short hint shown under the label"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`required-${item.id}`}
                checked={item.required}
                onCheckedChange={(checked) => onChange({ required: checked === true })}
              />
              <Label htmlFor={`required-${item.id}`} className="font-normal">
                Required
              </Label>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === 0}
              onClick={() => onMove(-1)}
              aria-label="Move item up"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={index === count - 1}
              onClick={() => onMove(1)}
              aria-label="Move item down"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              aria-label="Remove item"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AiDraftPanel({
  equipmentTypes,
  equipmentTypeId,
  onDraft,
}: {
  equipmentTypes: EquipmentType[];
  equipmentTypeId: string;
  onDraft: (items: ChecklistItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    const selectedType = equipmentTypes.find((t) => t.id === equipmentTypeId);
    const formData = new FormData();
    formData.set("equipmentTypeName", selectedType?.name ?? "General equipment");
    formData.set("equipmentTypeDescription", selectedType?.description ?? "");
    formData.set("purpose", purpose);

    const result = await generateChecklistDraftAction(formData);
    setGenerating(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    onDraft(result.items);
    toast.success(`Added ${result.items.length} draft item${result.items.length === 1 ? "" : "s"}`);
    setOpen(false);
    setPurpose("");
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Generate with AI
        </CardTitle>
        {!open && (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
            Get started
          </Button>
        )}
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="ai-purpose">What&apos;s this checklist for? (optional)</Label>
            <Textarea
              id="ai-purpose"
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Quarterly preventive maintenance visit"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Adds 6-15 draft items to the list below, based on the equipment type selected above. Review and
            edit them before saving.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating..." : "Generate items"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={generating}>
              Cancel
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ChecklistEditor({
  template,
  equipmentTypes,
  aiEnabled,
  canDelete,
}: {
  /** null for the "new checklist" page. */
  template: ChecklistTemplate | null;
  equipmentTypes: EquipmentType[];
  aiEnabled: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [equipmentTypeId, setEquipmentTypeId] = useState(template?.equipment_type_id ?? "");
  const [items, setItems] = useState<ChecklistItem[]>(template?.items ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  function updateItem(id: string, patch: Partial<ChecklistItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function moveItem(index: number, direction: -1 | 1) {
    setItems((prev) => move(prev, index, direction));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyChecklistItem()]);
  }

  function addDraftItems(draft: ChecklistItem[]) {
    setItems((prev) => [...prev, ...draft.map((item) => ({ ...item, id: item.id || newItemId() }))]);
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one item");
      return;
    }

    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("equipmentTypeId", equipmentTypeId);
    formData.set("items", JSON.stringify(items));

    setSaving(true);
    const result = template
      ? await updateChecklistTemplate(template.id, formData)
      : await createChecklistTemplate(formData);
    setSaving(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    toast.success(template ? "Checklist saved" : "Checklist created");
    if (!template && "id" in result && result.id) {
      router.push(`/dashboard/checklists/${result.id}`);
      return;
    }
    router.refresh();
  }

  async function handleToggleActive() {
    if (!template) return;
    setTogglingActive(true);
    const result = await setChecklistTemplateActive(template.id, !template.active);
    setTogglingActive(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(template.active ? "Checklist deactivated" : "Checklist activated");
    router.refresh();
  }

  async function handleDelete() {
    if (!template) return;
    if (!confirm(`Delete "${template.name}"? Past inspections that used it are kept.`)) return;
    const result = await deleteChecklistTemplate(template.id);
    if (result?.error) {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 py-5">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1.5">
            <Label htmlFor="checklist-name">Name</Label>
            <Input
              id="checklist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 90-day preventive maintenance"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checklist-description">Description (optional)</Label>
            <Textarea
              id="checklist-description"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checklist-type">Applies to</Label>
            <Select
              value={equipmentTypeId || "any"}
              onValueChange={(value) => setEquipmentTypeId(!value || value === "any" ? "" : value)}
              items={{ any: "Any equipment", ...Object.fromEntries(equipmentTypes.map((t) => [t.id, t.name])) }}
            >
              <SelectTrigger id="checklist-type" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any equipment</SelectItem>
                {equipmentTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {template && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleToggleActive}
                disabled={togglingActive}
              >
                {template.active ? "Deactivate" : "Activate"}
              </Button>
              {canDelete && (
                <Button type="button" variant="ghost" size="sm" onClick={handleDelete}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {aiEnabled && (
        <AiDraftPanel
          equipmentTypes={equipmentTypes}
          equipmentTypeId={equipmentTypeId}
          onDraft={addDraftItems}
        />
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Items</h2>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="size-3.5" />
            Add item
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Plus}
            message="No items yet. Add one by hand, or generate a draft with AI above."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                index={index}
                count={items.length}
                onChange={(patch) => updateItem(item.id, patch)}
                onRemove={() => removeItem(item.id)}
                onMove={(direction) => moveItem(index, direction)}
              />
            ))}
          </div>
        )}
      </div>

      <Button type="button" onClick={handleSubmit} disabled={saving}>
        {saving ? "Saving..." : template ? "Save changes" : "Create checklist"}
      </Button>
    </div>
  );
}
