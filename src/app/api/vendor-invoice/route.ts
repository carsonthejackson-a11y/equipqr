import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOwnerDispatchUpdateEmail } from "@/lib/email/owner-notifications";
import { sendEmail } from "@/lib/email/send";
import { enforceRateLimits, RATE_LIMITS } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";

// POST /api/vendor-invoice — the only write path from /v/<token> that needs
// the Node runtime (multipart parsing + a storage upload). The vendor never
// gets to choose the storage path or the file extension: both are built
// server-side from validated inputs, and the filename they sent is discarded
// entirely (docs/OWNER-ROADMAP-BRIEF.md §7.6).

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const CONTENT_TYPE_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function mapRpcError(error: { code?: string; message: string }): NextResponse {
  switch (error.code) {
    case "P0002":
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    case "P0001":
      return NextResponse.json({ error: "This request is closed" }, { status: 409 });
    case "22023":
      return NextResponse.json({ error: error.message }, { status: 400 });
    case "54000":
      return NextResponse.json(
        { error: "Too many requests — please wait a bit and try again." },
        { status: 429 }
      );
    default:
      return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const token = String(form.get("token") ?? "").slice(0, 200);
  const file = form.get("file");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file attached" }, { status: 400 });
  }

  const limited = await enforceRateLimits([
    { key: `vi:tok:${token}`, rule: RATE_LIMITS.vendorInvoicePerToken },
  ]);
  if (limited) return limited;

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than 10MB" }, { status: 400 });
  }
  const ext = CONTENT_TYPE_EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Only PDF, JPEG or PNG files are accepted" },
      { status: 400 }
    );
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "This isn't configured yet — contact support." },
      { status: 500 }
    );
  }

  // Resolves the dispatch and applies the same open/not-declined gate every
  // other vendor-token RPC does — this route doesn't re-implement that check.
  const { data: dispatchView, error: dispatchError } = await admin.rpc("get_vendor_dispatch", {
    p_token: token,
  });
  if (dispatchError) {
    return mapRpcError(dispatchError);
  }

  const dispatchId = (dispatchView as { dispatch: { id: string } }).dispatch.id;

  // get_vendor_dispatch()'s payload deliberately omits company_id (it's
  // never something the vendor's browser needs) — the admin client reads it
  // straight off the table, bypassing RLS, purely to build the storage path.
  const { data: dispatchRow } = await admin
    .from("dispatches")
    .select("company_id")
    .eq("id", dispatchId)
    .maybeSingle<{ company_id: string }>();

  if (!dispatchRow) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const storagePath = `${dispatchRow.company_id}/dispatch-invoices/${dispatchId}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("equipment-files")
    .upload(storagePath, bytes, { contentType: file.type });

  if (uploadError) {
    console.error("vendor-invoice: upload failed:", uploadError.message);
    return NextResponse.json({ error: "Couldn't upload that file — try again" }, { status: 500 });
  }

  const { data, error } = await admin.rpc("vendor_attach_dispatch_invoice", {
    p_token: token,
    p_storage_path: storagePath,
  });

  if (error) {
    // The upload landed but the RPC rejected it (shouldn't happen — the path
    // was built to match its own check exactly). Best-effort cleanup so the
    // bucket doesn't accumulate orphaned objects.
    await admin.storage.from("equipment-files").remove([storagePath]);
    return mapRpcError(error);
  }

  const notify = data as {
    action: "invoice";
    vendor_name: string;
    equipment_name: string;
    location_name: string | null;
    request_id: string;
    company_id: string;
    company_notification_email: string | null;
  };

  await sendOwnerInvoiceEmail(admin, notify);

  return NextResponse.json({ ok: true });
}

async function sendOwnerInvoiceEmail(
  admin: ReturnType<typeof createAdminClient>,
  notify: {
    vendor_name: string;
    equipment_name: string;
    location_name: string | null;
    request_id: string;
    company_id: string;
    company_notification_email: string | null;
  }
): Promise<void> {
  if (!notify.company_notification_email) return;

  try {
    const { data: company } = await admin
      .from("companies")
      .select("timezone")
      .eq("id", notify.company_id)
      .maybeSingle<{ timezone: string }>();

    const { subject, html, text } = buildOwnerDispatchUpdateEmail({
      vendorName: notify.vendor_name,
      action: "invoice",
      equipmentName: notify.equipment_name,
      locationName: notify.location_name,
      timeZone: company?.timezone ?? "UTC",
      requestUrl: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${notify.request_id}`,
    });

    await sendEmail({ to: notify.company_notification_email, subject, html, text });
  } catch (err) {
    console.error("vendor-invoice: failed to send owner notification email:", err);
  }
}
