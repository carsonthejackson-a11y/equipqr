import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

type MediaItem = { storage_path: string; media_type: "image" | "video" };

type RequestBody = {
  qrToken?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  media?: MediaItem[];
};

type SubmitResult = {
  request_id: string;
  company_name: string;
  company_notification_email: string;
  equipment_name: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;

  if (!body?.qrToken || !body.description?.trim() || !body.contactName?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const media = Array.isArray(body.media) ? body.media : [];

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("submit_service_request", {
    p_qr_token: body.qrToken,
    p_description: body.description.trim(),
    p_contact_name: body.contactName.trim(),
    p_contact_email: body.contactEmail?.trim() || "",
    p_contact_phone: body.contactPhone?.trim() || "",
    p_media: media,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = data as SubmitResult;

  await sendNotificationEmail(result, body, media.length);

  return NextResponse.json({ id: result.request_id });
}

async function sendNotificationEmail(
  result: SubmitResult,
  body: RequestBody,
  mediaCount: number
) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.warn(
      "RESEND_API_KEY or RESEND_FROM_EMAIL not configured — skipping service request email"
    );
    return;
  }

  const resend = new Resend(apiKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appUrl}/dashboard/requests/${result.request_id}`;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: result.company_notification_email,
      subject: `New service request: ${result.equipment_name}`,
      text: [
        `A new service request was submitted for ${result.equipment_name}.`,
        "",
        `Contact: ${body.contactName}`,
        body.contactEmail ? `Email: ${body.contactEmail}` : null,
        body.contactPhone ? `Phone: ${body.contactPhone}` : null,
        "",
        `Description: ${body.description}`,
        mediaCount > 0 ? `Attachments: ${mediaCount}` : null,
        "",
        `View in dashboard: ${dashboardUrl}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    console.error("Failed to send service request email", err);
  }
}
