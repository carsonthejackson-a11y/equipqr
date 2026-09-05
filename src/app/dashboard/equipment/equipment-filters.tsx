"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EQUIPMENT_STATUS_LABELS } from "@/components/status-badge";
import type { Customer, EquipmentType } from "@/lib/types";

export type EquipmentFilterValues = {
  q: string;
  type: string;
  customer: string;
  status: string;
};

const ALL = "all";

/**
 * Search + filter bar for the equipment list. Everything lives in the URL so
 * a filtered view is linkable, survives a refresh, and is filtered on the
 * server (the list can be thousands of rows — never in the browser).
 */
export function EquipmentFilters({
  values,
  equipmentTypes,
  customers,
}: {
  values: EquipmentFilterValues;
  equipmentTypes: EquipmentType[];
  customers: Customer[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState(values.q);

  function apply(next: Partial<EquipmentFilterValues>) {
    const merged: EquipmentFilterValues = { ...values, q: query, ...next };
    const params = new URLSearchParams();

    if (merged.q.trim()) params.set("q", merged.q.trim());
    if (merged.type && merged.type !== ALL) params.set("type", merged.type);
    if (merged.customer && merged.customer !== ALL) params.set("customer", merged.customer);
    if (merged.status && merged.status !== ALL) params.set("status", merged.status);
    // Any filter change invalidates the current page number.

    const search = params.toString();
    router.push(search ? `/dashboard/equipment?${search}` : "/dashboard/equipment");
  }

  function clear() {
    setQuery("");
    router.push("/dashboard/equipment");
  }

  const typeItems = {
    [ALL]: "All types",
    ...Object.fromEntries(equipmentTypes.map((type) => [type.id, type.name])),
  };
  const customerItems = {
    [ALL]: "All customers",
    ...Object.fromEntries(customers.map((customer) => [customer.id, customer.name])),
  };
  const statusItems = { [ALL]: "Any status", ...EQUIPMENT_STATUS_LABELS };

  const hasFilters =
    !!values.q || (!!values.type && values.type !== ALL) || (!!values.customer && values.customer !== ALL) || (!!values.status && values.status !== ALL);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        apply({});
      }}
    >
      <div className="min-w-56 flex-1 space-y-2">
        <Label htmlFor="equipment-search">Search</Label>
        <div className="flex gap-2">
          <Input
            id="equipment-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, serial, make, model or location"
          />
          <Button type="submit" variant="outline" aria-label="Search">
            <Search className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-type">Type</Label>
        <Select
          name="type"
          items={typeItems}
          value={values.type || ALL}
          onValueChange={(value: string | null) => apply({ type: value ?? ALL })}
        >
          <SelectTrigger id="filter-type" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(typeItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-customer">Customer</Label>
        <Select
          name="customer"
          items={customerItems}
          value={values.customer || ALL}
          onValueChange={(value: string | null) => apply({ customer: value ?? ALL })}
        >
          <SelectTrigger id="filter-customer" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(customerItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-status">Status</Label>
        <Select
          name="status"
          items={statusItems}
          value={values.status || ALL}
          onValueChange={(value: string | null) => apply({ status: value ?? ALL })}
        >
          <SelectTrigger id="filter-status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusItems).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button type="button" variant="ghost" onClick={clear}>
          <X className="size-4" />
          Clear
        </Button>
      )}
    </form>
  );
}
