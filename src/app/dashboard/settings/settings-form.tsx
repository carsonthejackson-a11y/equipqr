"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Company } from "@/lib/types";
import { updateCompanySettings } from "./actions";

export function SettingsForm({ company }: { company: Company }) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await updateCompanySettings(company.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Settings saved");
  }

  return (
    <form action={handleSubmit} className="max-w-md space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Company name</Label>
        <Input id="name" name="name" defaultValue={company.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notificationEmail">Notification email</Label>
        <Input
          id="notificationEmail"
          name="notificationEmail"
          type="email"
          defaultValue={company.notification_email}
          required
        />
        <p className="text-sm text-muted-foreground">
          New service requests are emailed here.
        </p>
      </div>
      <Button type="submit">Save</Button>
    </form>
  );
}
