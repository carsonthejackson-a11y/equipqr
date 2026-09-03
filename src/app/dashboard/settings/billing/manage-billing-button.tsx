"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ManageBillingButton({
  onOpenPortal,
}: {
  onOpenPortal: () => Promise<{ error: string } | void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-1.5">
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await onOpenPortal();
            if (result?.error) setError(result.error);
          });
        }}
      >
        {isPending ? "Opening…" : "Manage billing"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
