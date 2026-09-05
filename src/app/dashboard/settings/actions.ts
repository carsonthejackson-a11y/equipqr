"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isValidTimezone } from "./timezones";

// Loose E.164-ish check: an optional leading +, then digits/spaces/dashes/
// parens. Field is optional — public contact fields (phone/SMS) may be
// blank, in which case their "Call us"/"Text us" button just doesn't show
// on customer-facing pages (see src/lib/branding.ts).
const PHONE_PATTERN = /^\+?[\d\s\-()]{7,20}$/;

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Returns an error message when the field is non-blank but doesn't look like a phone number, else null. */
function phoneErrorMessage(raw: string, label: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!PHONE_PATTERN.test(trimmed)) {
    return `${label} doesn't look like a phone number`;
  }
  return null;
}

/** Normalises a website into an absolute https(s):// URL, or null if left blank. Returns undefined on invalid input. */
function normalizeWebsite(raw: string): string | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function updateCompanySettings(companyId: string, formData: FormData) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }
  if (ctx.company.id !== companyId) {
    return { error: "Company not found" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const notificationEmail = String(formData.get("notificationEmail") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "");
  const smsRaw = String(formData.get("smsNumber") ?? "");
  const websiteRaw = String(formData.get("website") ?? "");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const customerUpdatesEnabled = formData.get("customerUpdatesEnabled") === "on";

  if (!name || !notificationEmail) {
    return { error: "Company name and notification email are required" };
  }

  const phoneError = phoneErrorMessage(phoneRaw, "Phone");
  if (phoneError) {
    return { error: phoneError };
  }
  const smsError = phoneErrorMessage(smsRaw, "SMS number");
  if (smsError) {
    return { error: smsError };
  }

  const website = normalizeWebsite(websiteRaw);
  if (website === undefined) {
    return { error: "Website doesn't look like a valid URL" };
  }

  if (!timezone || !isValidTimezone(timezone)) {
    return { error: "Choose a valid timezone" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      notification_email: notificationEmail,
      phone: normalizePhone(phoneRaw),
      sms_number: normalizePhone(smsRaw),
      website,
      timezone,
      customer_updates_enabled: customerUpdatesEnabled,
    })
    .eq("id", companyId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/settings/branding");
  revalidatePath("/dashboard");
  return { success: true };
}
