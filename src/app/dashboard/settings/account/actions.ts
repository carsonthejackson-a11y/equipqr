"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export async function updateFullName(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) {
    return { error: "Name is required" };
  }

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/account");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Owner-only, self-serve company deletion. Requires the caller to type the
 * company's exact name (checked here too, not just client-side — the dialog
 * disables its own submit button on a mismatch, but that's just UX). Deletes
 * every DB row via the delete_company() RPC (0009_polish.sql — cascades
 * handle every child table), best-effort-cleans the company's service
 * request media from storage (Postgres cascades don't reach Supabase
 * Storage), then signs the caller out.
 */
export async function deleteCompany(typedName: string) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can delete the company" };
  }

  if (typedName.trim() !== ctx.company.name) {
    return { error: "Type the company name exactly to confirm" };
  }

  const supabase = await createClient();

  // Gather storage paths BEFORE deleting: delete_company() cascades
  // service_requests -> service_request_media, so those rows won't exist to
  // query afterwards.
  const { data: requests } = await supabase
    .from("service_requests")
    .select("id")
    .eq("company_id", ctx.company.id);

  const requestIds = (requests ?? []).map((r) => r.id as string);
  let storagePaths: string[] = [];

  if (requestIds.length > 0) {
    const { data: media } = await supabase
      .from("service_request_media")
      .select("storage_path")
      .in("service_request_id", requestIds);
    storagePaths = (media ?? []).map((m) => m.storage_path as string);
  }

  // Deleting the DB rows doesn't stop Stripe billing the customer, so cancel
  // every live subscription FIRST and bail out if that fails — a company we
  // can't stop charging must not be deleted.
  if (ctx.company.stripe_customer_id && isStripeConfigured()) {
    const cancelError = await cancelStripeSubscriptions(ctx.company.stripe_customer_id);
    if (cancelError) {
      return { error: cancelError };
    }
  }

  const { error } = await supabase.rpc("delete_company");
  if (error) {
    return { error: error.message };
  }

  // Best-effort: the company/DB rows are already gone at this point, so a
  // failure here just leaves orphaned objects in the bucket rather than
  // blocking or rolling back anything — logged for manual cleanup (see
  // docs/RUNBOOK.md).
  try {
    const admin = createAdminClient();
    if (storagePaths.length > 0) {
      await admin.storage.from("service-request-media").remove(storagePaths);
    }
    // The two per-company buckets from 0013 name every object
    // "<company_id>/..." — company-assets (logo, equipment photos) is PUBLIC,
    // so anything left here stays downloadable by URL after the company is
    // gone; equipment-files holds documents, inspection photos/signatures and
    // dispatch invoices. Neither is reachable from a DB row any more, so walk
    // the prefix itself.
    await removePrefix(admin, "company-assets", ctx.company.id);
    await removePrefix(admin, "equipment-files", ctx.company.id);
  } catch (err) {
    console.error(`delete_company: failed to remove storage objects for ${ctx.company.id}:`, err);
  }

  // Clear the server-side session so the client's redirect to "/" lands
  // signed out.
  await supabase.auth.signOut();

  return { success: true };
}

/**
 * Cancels every still-live subscription on a company's Stripe customer.
 * Returns null on success, or a user-facing message when anything went wrong
 * — the caller treats that as "don't delete the company", since a deleted
 * company with a live subscription would keep being charged with nowhere in
 * the app left to cancel from.
 */
async function cancelStripeSubscriptions(customerId: string): Promise<string | null> {
  try {
    const stripe = getStripe();
    const { data: subscriptions } = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });

    for (const subscription of subscriptions) {
      if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
        continue;
      }
      await stripe.subscriptions.cancel(subscription.id);
    }

    return null;
  } catch (err) {
    console.error(`delete_company: failed to cancel Stripe subscriptions for ${customerId}:`, err);
    return "Could not cancel your Stripe subscription — please cancel it from Manage billing first";
  }
}

/** Storage list() page size and the most keys one remove() call accepts. */
const STORAGE_LIST_PAGE = 1000;
const STORAGE_REMOVE_BATCH = 1000;

/**
 * Removes every object under `<prefix>/` in `bucket`. Supabase Storage has no
 * "delete folder": `list()` is one level deep and reports sub-folders as
 * entries with `id === null`, so this recurses into those and removes the
 * files it finds in batches. Best-effort like its caller — a failed page or
 * batch is logged and skipped, never thrown. Not exported on purpose: an
 * exported async function in a "use server" file becomes a public endpoint.
 */
async function removePrefix(admin: ReturnType<typeof createAdminClient>, bucket: string, prefix: string) {
  const objects = admin.storage.from(bucket);
  const files: string[] = [];
  const folders: string[] = [];

  // Collect the whole level before recursing/removing: deleting a sub-folder's
  // contents makes that (virtual) folder vanish from this listing, which would
  // shift later pages' offsets and skip an entry. Pages advance by what came
  // back (not by the requested limit) and stop on an empty page, so a server
  // that caps `limit` lower than asked still gets walked to the end.
  for (let offset = 0; ; ) {
    const { data, error } = await objects.list(prefix, { limit: STORAGE_LIST_PAGE, offset });
    if (error) {
      console.error(`delete_company: failed to list ${bucket}/${prefix}:`, error.message);
      return;
    }
    if (data.length === 0) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        folders.push(path);
      } else {
        files.push(path);
      }
    }
    offset += data.length;
  }

  for (const folder of folders) {
    await removePrefix(admin, bucket, folder);
  }

  for (let i = 0; i < files.length; i += STORAGE_REMOVE_BATCH) {
    const { error } = await objects.remove(files.slice(i, i + STORAGE_REMOVE_BATCH));
    if (error) {
      console.error(`delete_company: failed to remove objects under ${bucket}/${prefix}:`, error.message);
    }
  }
}
