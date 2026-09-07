"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  MAX_FIELD_HELP_TEXT_LENGTH,
  MAX_FIELD_LABEL_LENGTH,
  slugifyFieldKey,
} from "@/lib/custom-fields";
import type { CustomFieldType, EquipmentCustomField } from "@/lib/types";
import { createCustomField, updateCustomField } from "./actions";

const typeItems: Record<string, string> = Object.fromEntries(
  CUSTOM_FIELD_TYPES.map((type) => [type, CUSTOM_FIELD_TYPE_LABELS[type]])
);

/**
 * Add / edit dialog for one definition. In edit mode the key is shown but
 * not editable — it is the jsonb key on every unit, so renaming it would
 * orphan every value. Change the label freely instead.
 */
export function CustomFieldDialog({
  open,
  onOpenChange,
  field,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null for "add". */
  field: EquipmentCustomField | null;
}) {
  const editing = !!field;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit field" : "Add field"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change how the field looks and behaves. Its key stays the same so existing values keep their place."
              : "Appears on every unit's Details tab, in the CSV export and in the API."}
          </DialogDescription>
        </DialogHeader>
        {/* The popup unmounts when the dialog closes, so this form mounts fresh
            on every open and seeds its state from `field` without an effect. */}
        <CustomFieldForm field={field} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomFieldForm({
  field,
  onDone,
}: {
  field: EquipmentCustomField | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const editing = !!field;
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState(field?.label ?? "");
  const [key, setKey] = useState(field?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(editing);
  const [fieldType, setFieldType] = useState<CustomFieldType>(field?.field_type ?? "text");
  const [showOnScanPage, setShowOnScanPage] = useState(field?.show_on_scan_page ?? false);

  function handleLabelChange(value: string) {
    setLabel(value);
    if (!keyEdited) setKey(slugifyFieldKey(value));
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSaving(true);
    // Checkboxes only appear in FormData when checked — set it from state so
    // "unchecking and saving" actually turns it off.
    formData.set("showOnScanPage", showOnScanPage ? "on" : "off");
    formData.set("fieldType", fieldType);
    const result = field
      ? await updateCustomField(field.id, formData)
      : await createCustomField(formData);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success(field ? "Field updated" : "Field added");
    onDone();
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="cf-label">Label</Label>
        <Input
          id="cf-label"
          name="label"
          value={label}
          onChange={(e) => handleLabelChange(e.target.value)}
          maxLength={MAX_FIELD_LABEL_LENGTH}
          placeholder="e.g. Filter size"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cf-key">Key</Label>
        <Input
          id="cf-key"
          name={editing ? undefined : "key"}
          value={key}
          onChange={(e) => {
            setKeyEdited(true);
            setKey(e.target.value);
          }}
          readOnly={editing}
          aria-readonly={editing}
          className={editing ? "bg-muted/50 font-mono text-xs" : "font-mono text-xs"}
          pattern="[a-z][a-z0-9_]{0,39}"
          title="Lowercase letters, digits and underscores; starts with a letter"
        />
        <p className="text-sm text-muted-foreground">
          {editing
            ? "Keys can't change after creation."
            : "How the value is named in exports and the API. Filled in from the label; edit it before saving if you like."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cf-type">Type</Label>
        <Select
          items={typeItems}
          value={fieldType}
          onValueChange={(value: string | null) => {
            if (value && value in typeItems) setFieldType(value as CustomFieldType);
          }}
        >
          <SelectTrigger id="cf-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOM_FIELD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {CUSTOM_FIELD_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {fieldType === "select" && (
        <div className="space-y-2">
          <Label htmlFor="cf-options">Options</Label>
          <Textarea
            id="cf-options"
            name="options"
            rows={4}
            defaultValue={field?.options.join("\n") ?? ""}
            placeholder={"16x20\n20x25\n24x24"}
          />
          <p className="text-sm text-muted-foreground">One option per line.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="cf-help">Help text (optional)</Label>
        <Input
          id="cf-help"
          name="helpText"
          defaultValue={field?.help_text ?? ""}
          maxLength={MAX_FIELD_HELP_TEXT_LENGTH}
          placeholder="Shown under the input"
        />
      </div>

      <label className="group/field flex items-start gap-2.5">
        <Checkbox
          checked={showOnScanPage}
          onCheckedChange={(checked) => setShowOnScanPage(checked === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-tight">
          Show on the customer scan page
          <span className="mt-0.5 block text-muted-foreground">
            Customers who scan the QR code see this field&apos;s value under the unit name. Leave
            off for internal details like asset tags.
          </span>
        </span>
      </label>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : editing ? "Save" : "Add field"}
        </Button>
      </DialogFooter>
    </form>
  );
}
