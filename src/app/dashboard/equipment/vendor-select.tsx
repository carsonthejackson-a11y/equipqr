"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Vendor } from "@/lib/types";

/**
 * Owner roadmap (docs/OWNER-ROADMAP-BRIEF.md §3.2, equipment form): a vendor
 * picker shared by the unit vendor field and the warranty vendor field.
 *
 * `kind="vendor"` is the unit's own vendor — its empty-string option means
 * "use the category default", so submit_owner_service_request() resolves a
 * vendor at dispatch time (§2.2.3's precedence). `kind="warranty"` is a
 * plain optional field with no category-default concept — its empty-string
 * option just means "no warranty vendor set".
 */
export function VendorSelect({
  name,
  kind,
  vendors,
  categoryDefault = null,
  defaultValue = "",
}: {
  name: string;
  kind: "vendor" | "warranty";
  vendors: Vendor[];
  /** The category's current default vendor (from category_default_vendors), if any — only meaningful for kind="vendor". */
  categoryDefault?: Vendor | null;
  defaultValue?: string;
}) {
  const emptyLabel =
    kind === "vendor"
      ? categoryDefault
        ? `Use category default (${categoryDefault.name})`
        : "Use category default (none set)"
      : "No warranty vendor";

  const items: Record<string, string> = {
    "": emptyLabel,
    ...Object.fromEntries(vendors.map((v) => [v.id, v.name])),
  };

  return (
    <Select name={name} items={items} defaultValue={defaultValue}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{emptyLabel}</SelectItem>
        {vendors.map((vendor) => (
          <SelectItem key={vendor.id} value={vendor.id}>
            {vendor.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
