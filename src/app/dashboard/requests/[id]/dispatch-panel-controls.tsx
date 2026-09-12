"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dispatchToVendor, resendDispatch } from "../dispatch-actions";
import type { Vendor } from "@/lib/types";

// The two interactive bits of DispatchPanel (a server component) — kept in
// their own client file so the panel itself can stay a plain async server
// component, matching the rest of this page's pattern (StatusControl,
// AssigneeControl, etc. are each their own small client islands too).

export function ResendDispatchButton({ requestId, disabled }: { requestId: string; disabled?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await resendDispatch(requestId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Dispatch email resent");
        router.refresh();
      }
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={disabled || isPending} onClick={handleClick}>
      {isPending ? "Resending…" : "Resend to vendor"}
    </Button>
  );
}

export function DispatchAssignForm({ requestId, vendors }: { requestId: string; vendors: Vendor[] }) {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  if (vendors.length === 0) {
    return (
      <p className="text-muted-foreground">
        No vendors set up yet — add one on the Vendors page first.
      </p>
    );
  }

  function handleAssign() {
    if (!vendorId) {
      toast.error("Pick a vendor first");
      return;
    }
    startTransition(async () => {
      const result = await dispatchToVendor(requestId, vendorId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Dispatched to vendor");
        router.refresh();
      }
    });
  }

  const items = Object.fromEntries(vendors.map((v) => [v.id, v.name]));

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={vendorId} onValueChange={(v) => setVendorId(v ?? "")} items={items} disabled={isPending}>
        <SelectTrigger className="w-full sm:w-56">
          <SelectValue placeholder="Choose a vendor" />
        </SelectTrigger>
        <SelectContent>
          {vendors.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
              {!v.email ? " (no email)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" disabled={isPending} onClick={handleAssign}>
        {isPending ? "Dispatching…" : "Dispatch"}
      </Button>
    </div>
  );
}
