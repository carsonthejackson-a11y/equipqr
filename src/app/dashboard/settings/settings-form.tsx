"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Company } from "@/lib/types";
import { updateCompanySettings } from "./actions";

export function SettingsForm({
  company,
  commonTimezones,
  otherTimezones,
}: {
  company: Company;
  commonTimezones: { value: string; label: string }[];
  otherTimezones: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState(company.timezone);
  const [customerUpdatesEnabled, setCustomerUpdatesEnabled] = useState(company.customer_updates_enabled);

  const timezoneItems: Record<string, string> = {
    ...Object.fromEntries(commonTimezones.map((tz) => [tz.value, tz.label])),
    ...Object.fromEntries(otherTimezones.map((tz) => [tz, tz])),
  };

  async function handleSubmit(formData: FormData) {
    setError(null);
    // Checkboxes only appear in FormData when checked — set it explicitly
    // from state so "unchecking and saving" actually turns it off.
    formData.set("customerUpdatesEnabled", customerUpdatesEnabled ? "on" : "off");
    formData.set("timezone", timezone);

    const result = await updateCompanySettings(company.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Settings saved");
  }

  return (
    <form action={handleSubmit} className="max-w-md space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-4">
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
          <p className="text-sm text-muted-foreground">New service requests are emailed here.</p>
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div>
          <h2 className="text-sm font-medium">Public contact info</h2>
          <p className="text-sm text-muted-foreground">
            Shown to customers on the QR scan page and their request status page. Leave blank to hide a
            button. Your logo and brand color are set on the{" "}
            <a href="/dashboard/settings/branding" className="underline underline-offset-2">
              Branding
            </a>{" "}
            tab.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" placeholder="(214) 555-0100" defaultValue={company.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="smsNumber">SMS number</Label>
          <Input
            id="smsNumber"
            name="smsNumber"
            type="tel"
            placeholder="(214) 555-0100"
            defaultValue={company.sms_number ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            type="text"
            placeholder="www.example.com"
            defaultValue={company.website ?? ""}
          />
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-2">
          <Label htmlFor="timezone">Timezone</Label>
          <Select
            value={timezone}
            onValueChange={(value) => value && setTimezone(value)}
            items={timezoneItems}
          >
            <SelectTrigger id="timezone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {commonTimezones.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {otherTimezones.length > 0 && (
                <SelectGroup>
                  {otherTimezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">Used for scheduling and reminder timestamps.</p>
        </div>

        <label className="group/field flex items-start gap-2.5">
          <Checkbox
            checked={customerUpdatesEnabled}
            onCheckedChange={(checked) => setCustomerUpdatesEnabled(checked === true)}
          />
          <span className="text-sm leading-tight">
            Email customers when their request status changes
            <span className="mt-0.5 block text-muted-foreground">
              Only sent to requesters who left an email address.
            </span>
          </span>
        </label>
      </div>

      <Button type="submit">Save</Button>
    </form>
  );
}
