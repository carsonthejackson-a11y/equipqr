"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dismissOnboardingChecklist } from "./actions";

export type ChecklistItem = {
  key: string;
  label: string;
  href: string;
  done: boolean;
  optional?: boolean;
};

export function GettingStartedChecklist({
  items,
  dismissible,
}: {
  items: ChecklistItem[];
  dismissible: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissOnboardingChecklist();
      if (!result?.error) {
        setDismissed(true);
        router.refresh();
      }
    });
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Getting started</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {doneCount} of {items.length} done
          </p>
        </div>
        {dismissible && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDismiss}
            disabled={pending}
            aria-label="Dismiss checklist"
          >
            <X />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent",
                  item.done && "text-muted-foreground"
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn(item.done && "line-through")}>{item.label}</span>
                {item.optional && (
                  <Badge variant="outline" className="ml-auto">
                    Optional
                  </Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
