import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { summarizeTroubleshootingPath } from "@/lib/anthropic";
import { buildServiceRequestNotificationEmail } from "@/lib/email/service-request-notification";
import { sendEmail } from "@/lib/email/send";

type MediaItem = { storage_path: string; media_type: "image" | "video" };
type PathEntry = { question: string; answer: string };

type RequestBody = {
  qrToken?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  media?: MediaItem[];
  troubleshootingPath?: PathEntry[];
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
  const troubleshootingPath = Array.isArray(body.troubleshootingPath) ? body.troubleshootingPath : [];

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("submit_service_request", {
    p_qr_token: body.qrToken,
    p_description: body.description.trim(),
    p_contact_name: body.contactName.trim(),
    p_contact_email: body.contactEmail?.trim() || "",
    p_contact_phone: body.contactPhone?.trim() || "",
    p_media: media,
    p_troubleshooting_path: troubleshootingPath,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = data as SubmitResult;

  const aiSummary = await summarizeTroubleshootingPath({
    equipmentName: result.equipment_name,
    description: body.description.trim(),
    path: troubleshootingPath,
  });

  if (aiSummary) {
    await supabase.from("service_requests").update({ ai_summary: aiSummary }).eq("id", result.request_id);
  }

  await sendNotificationEmail(result, body, media.length, troubleshootingPath, aiSummary);

  return NextResponse.json({ id: result.request_id });
}

async function sendNotificationEmail(
  result: SubmitResult,
  body: RequestBody,
  mediaCount: number,
  troubleshootingPath: PathEntry[],
  aiSummary: string | null
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appUrl}/dashboard/requests/${result.request_id}`;

  const { subject, html, text } = buildServiceRequestNotificationEmail({
    equipmentName: result.equipment_name,
    contactName: body.contactName ?? "",
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
    description: body.description ?? "",
    mediaCount,
    aiSummary,
    troubleshootingPath,
    dashboardUrl,
  });

  await sendEmail({ to: result.company_notification_email, subject, html, text });
}
