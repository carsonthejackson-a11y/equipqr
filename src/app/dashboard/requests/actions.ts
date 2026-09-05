"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildResolutionEmail } from "@/lib/email/resolution";
import { sendEmail } from "@/lib/email/send";
import { requireActiveSubscription } from "@/lib/billing";
import type { RequestStatus, ServiceRequest } from "@/lib/types";

export async function updateRequestStatus(id: string, status: RequestStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_requests")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true };
}

export async function closeServiceRequest(id: string, formData: FormData) {
  const summary = String(formData.get("summary") ?? "").trim();
  const recommendations = String(formData.get("recommendations") ?? "").trim();
  const sendEmail = formData.get("sendEmail") === "on";
  const emailTo = String(formData.get("emailTo") ?? "").trim();

  if (!summary) {
    return { error: "Summary of work performed is required" };
  }

  if (sendEmail && !emailTo) {
    return { error: "Enter an email address, or uncheck emailing the customer" };
  }

  const lockError = await requireActiveSubscription();
  if (lockError) {
    return { error: lockError.error };
  }

  const supabase = await createClient();

  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<ServiceRequest>();

  if (!serviceRequest) {
    return { error: "Service request not found" };
  }

  let emailSentAt: string | null = null;

  if (sendEmail) {
    const [{ data: equipment }, { data: company }] = await Promise.all([
      supabase.from("equipment").select("name").eq("id", serviceRequest.equipment_id).maybeSingle(),
      supabase.from("companies").select("name").eq("id", serviceRequest.company_id).maybeSingle(),
    ]);

    const sent = await sendResolutionEmail({
      to: emailTo,
      companyName: company?.name ?? "Your service provider",
      equipmentName: equipment?.name ?? "your equipment",
      contactName: serviceRequest.contact_name,
      summary,
      recommendations,
    });

    if (sent) {
      emailSentAt = new Date().toISOString();
    }
  }

  const { error } = await supabase
    .from("service_requests")
    .update({
      status: "resolved",
      resolution_summary: summary,
      resolution_recommendations: recommendations || null,
      resolved_at: new Date().toISOString(),
      ...(emailSentAt ? { resolution_email_sent_at: emailSentAt } : {}),
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/requests");
  revalidatePath(`/dashboard/requests/${id}`);
  return { success: true, emailSent: !!emailSentAt, emailAttempted: sendEmail };
}

async function sendResolutionEmail(params: {
  to: string;
  companyName: string;
  equipmentName: string;
  contactName: string;
  summary: string;
  recommendations: string;
}) {
  const { subject, html, text } = buildResolutionEmail(params);
  return sendEmail({ to: params.to, subject, html, text });
}
