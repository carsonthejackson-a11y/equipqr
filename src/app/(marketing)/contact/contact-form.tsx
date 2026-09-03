"use client";

import { useActionState } from "react";
import { CircleCheck, TriangleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { submitContactForm, initialContactState } from "./actions";

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(submitContactForm, initialContactState);

  if (state.status === "success") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-accent p-4 text-accent-foreground">
        <CircleCheck className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="company">Company (optional)</Label>
        <Input id="company" name="company" autoComplete="organization" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="message">How can we help?</Label>
        <Textarea id="message" name="message" required rows={5} />
      </div>

      {state.status === "error" ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm">{state.message}</p>
        </div>
      ) : null}

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto" size="lg">
        {isPending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
        {isPending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
