import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTrialEndingEmail } from "@/lib/email/trial-ending";
import { sendEmail } from "@/lib/email/send";
import { serverEnv } from "@/lib/env";

// Needs the Node runtime for the service-role admin client + auth admin API.
export const runtime = "nodejs";

const REMINDER_WINDOW_DAYS = 3;

type TrialingCompany = {
  id: string;
  name: string;
  trial_ends_at: string;
};

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/**
 * Daily job (see vercel.json) that emails a company's owner(s) ~3 days
 * before their trial ends, unless they already have an active subscription
 * or the reminder was already sent. Vercel Cron calls this with a GET and an
 * `Authorization: Bearer <CRON_SECRET>` header; anything else (missing
 * secret, wrong value) is rejected.
 */
export async function GET(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 86_400_000);

  const { data: companies, error } = await admin
    .from("companies")
    .select("id, name, trial_ends_at")
    .is("trial_reminder_sent_at", null)
    .gte("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", windowEnd.toISOString())
    .returns<TrialingCompany[]>();

  if (error) {
    console.error("trial-reminders cron: failed to query companies:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let remindedCount = 0;
  let emailsSent = 0;

  for (const company of companies ?? []) {
    // Skip companies that already have an active paid subscription — only
    // still-trialing companies with nothing behind them need the nudge.
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status")
      .eq("company_id", company.id)
      .maybeSingle<{ status: string }>();

    if (subscription?.status === "active") {
      continue;
    }

    const { data: owners } = await admin
      .from("profiles")
      .select("id")
      .eq("company_id", company.id)
      .eq("role", "owner")
      .returns<{ id: string }[]>();

    const { subject, html, text } = buildTrialEndingEmail({
      companyName: company.name,
      daysLeft: daysLeft(company.trial_ends_at),
      billingUrl: `${appUrl}/dashboard/settings/billing`,
    });

    let sentForCompany = false;

    for (const owner of owners ?? []) {
      const { data: userResult, error: userError } = await admin.auth.admin.getUserById(owner.id);
      const email = userResult?.user?.email;
      if (userError || !email) continue;

      const sent = await sendEmail({ to: email, subject, html, text });
      if (sent) {
        emailsSent++;
        sentForCompany = true;
      }
    }

    // Only flag a company once a reminder actually went out. Leaving the
    // column null when nothing sent (Resend unconfigured, API error, no
    // owner with an email) means tomorrow's run picks the company up again
    // while it's still inside the reminder window.
    if (!sentForCompany) {
      continue;
    }

    const { error: updateError } = await admin
      .from("companies")
      .update({ trial_reminder_sent_at: new Date().toISOString() })
      .eq("id", company.id);

    if (updateError) {
      console.error(`trial-reminders cron: failed to flag company ${company.id}:`, updateError.message);
      continue;
    }

    remindedCount++;
  }

  return NextResponse.json({ companiesChecked: companies?.length ?? 0, remindedCount, emailsSent });
}
