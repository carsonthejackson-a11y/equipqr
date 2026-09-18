import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { CircleUserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardTopNav } from "@/components/dashboard-topnav";
import { DashboardScanButton } from "@/components/dashboard-scan-button";
import { SignOutButton } from "@/components/sign-out-button";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LockedScreen } from "@/components/billing/locked-screen";
import { TrialBanner } from "@/components/billing/trial-banner";
import { getEntitlements } from "@/lib/billing";
import { buildWelcomeEmail } from "@/lib/email/welcome";
import { sendEmail } from "@/lib/email/send";
import type { Company, CompanyKind, Profile } from "@/lib/types";

const BILLING_PATH = "/dashboard/settings/billing";
const OWNER_ONBOARDING_PATH = "/dashboard/onboarding/owner";
// How long after companies.created_at a dashboard load still counts as the
// sign-up that created the company (see the welcome-email block below).
const WELCOME_EMAIL_WINDOW_MS = 10 * 60 * 1000;

/** meta.pending_company_kind is user-supplied (auth metadata) — never trust it beyond these two literals. */
function pendingCompanyKind(value: string | undefined): CompanyKind {
  return value === "equipment_owner" ? "equipment_owner" : "service_provider";
}

// Plain helper (not the component body) so the `Date.now()` read stays out
// of render, like daysUntil() below.
function createdWithinWelcomeWindow(company: Pick<Company, "created_at"> | null): boolean {
  if (!company) return false;
  return Date.now() - new Date(company.created_at).getTime() < WELCOME_EMAIL_WINDOW_MS;
}

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // Tracks whether THIS request is the one that just created the company, so
  // the welcome email (below, once `company` is fetched) only ever fires on
  // that one request rather than every dashboard load.
  let justCreatedCompany = false;

  if (!profile) {
    const meta = user.user_metadata as Record<string, string | undefined>;
    const companyName = meta.pending_company_name;
    const notificationEmail = meta.pending_notification_email;
    const fullName = meta.pending_full_name;
    const pendingInviteToken = meta.pending_invite_token;

    // Someone who signed up via an invite link has no company to create —
    // send them to accept the invite (which creates their profile) instead
    // of falling through to onboarding.
    if (pendingInviteToken) {
      redirect(`/invite/${pendingInviteToken}`);
    }

    if (!companyName || !notificationEmail) {
      redirect("/onboarding");
    }

    const { data: companyId, error } = await supabase.rpc("create_company_and_profile", {
      p_company_name: companyName,
      p_notification_email: notificationEmail,
      p_full_name: fullName ?? "",
      p_kind: pendingCompanyKind(meta.pending_company_kind),
    });

    if (error || !companyId) {
      redirect("/onboarding");
    }

    // Built directly from the RPC result instead of a follow-up SELECT: the
    // dashboard can briefly get two near-simultaneous requests right after
    // email confirmation (router prefetch racing the real navigation), and a
    // second SELECT for a row the other request just committed is prone to
    // missing it. The RPC itself is idempotent, so this is always accurate.
    profile = {
      id: user.id,
      company_id: companyId,
      full_name: fullName ?? null,
      role: "owner",
      created_at: new Date().toISOString(),
    };
    justCreatedCompany = true;
  }

  if (!profile) {
    redirect("/onboarding");
  }

  const [{ data: company }, { data: isAdmin }, entitlements, headerList, { count: requestsBadgeCount }] =
    await Promise.all([
      supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle<Company>(),
      supabase.rpc("is_platform_admin"),
      getEntitlements(),
      headers(),
      // Q-32: the Requests/Work Orders nav badge — same predicate for both
      // company kinds, since /dashboard/requests and its service_requests
      // rows are the same underlying data either way (dashboard-nav-links.ts
      // just labels the link differently per kind). RLS already scopes this
      // to the caller's own company, matching every other count query below.
      supabase
        .from("service_requests")
        .select("*", { count: "exact", head: true })
        .or("status.eq.new,unread_customer_messages.gt.0"),
    ]);

  // Best-effort, idempotent welcome email — only ever sent once (guarded by
  // companies.welcome_email_sent_at) and only for a company that was just
  // created, never on a routine dashboard load. Deferred with after() so a
  // slow Resend call never delays the first dashboard paint.
  //
  // "Just created" is not only `justCreatedCompany`: the page's own
  // getCurrentProfile() (src/lib/auth.ts) runs in parallel with this layout
  // and may be the request that wins the create_company_and_profile() race.
  // When it does, the SELECT above already finds the row and this flag stays
  // false — so a company created within the last few minutes with the flag
  // still unset counts too. The flag is only stamped after a successful send,
  // which keeps this idempotent across the two racing requests.
  const createdRecently = createdWithinWelcomeWindow(company);
  if ((justCreatedCompany || createdRecently) && company && !company.welcome_email_sent_at) {
    const newCompany = company;
    const recipientName = profile.full_name;
    after(async () => {
      await sendWelcomeEmailOnce(supabase, newCompany, recipientName);
    });
  }

  const kind: CompanyKind = company?.kind ?? "service_provider";
  const pathname = headerList.get("x-pathname") ?? "";
  const onBillingPage = pathname === BILLING_PATH || pathname.startsWith(`${BILLING_PATH}/`);
  const onOwnerOnboarding = pathname === OWNER_ONBOARDING_PATH;

  // Owner roadmap (docs/OWNER-ROADMAP-BRIEF.md §9 Q1): equipment_owner
  // companies are never locked — get_company_entitlements() already returns
  // is_locked: false for that kind, but the check is repeated here (belt and
  // suspenders per §3.4's file-ownership note) so a future entitlements bug
  // can't lock an owner out of their own free plan. Same for the trial
  // banner: an owner's free tier isn't a "trial", so there's nothing to
  // remind them to upgrade before.
  const isLocked = kind !== "equipment_owner" && !!entitlements?.is_locked && !onBillingPage;
  const trialDaysLeft =
    kind !== "equipment_owner" && entitlements?.is_trialing && entitlements.trial_ends_at
      ? daysUntil(entitlements.trial_ends_at)
      : null;

  // First-run wizard: an owner-kind company that hasn't finished setup yet
  // (no location seeded, no equipment types confirmed) is sent to the
  // wizard from every other /dashboard/** route — except from inside the
  // wizard itself (that would loop) and never while locked (locked already
  // renders LockedScreen above, and can't happen for this kind anyway).
  if (kind === "equipment_owner" && !company?.owner_setup_completed_at && !onOwnerOnboarding && !isLocked) {
    redirect(OWNER_ONBOARDING_PATH);
  }

  const badgeCount = requestsBadgeCount ?? 0;

  return (
    <div className="flex min-h-svh">
      {/* Q-64: first focusable element, invisible until it has focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <aside className="hidden w-60 shrink-0 border-r bg-muted/20 p-4 md:flex md:flex-col md:justify-between print:hidden">
        <div>
          <div className="mb-6 flex items-center gap-2 px-3">
            <LogoMark className="size-7 text-primary" />
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{company?.name ?? "EquipQR"}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.full_name}</p>
            </div>
          </div>
          <DashboardNav isAdmin={!!isAdmin} role={profile.role} kind={kind} requestsBadgeCount={badgeCount} />
        </div>
        <SignOutButton />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b p-4 md:hidden print:hidden">
          <div className="flex items-center gap-2">
            <LogoMark className="size-7 text-primary" />
            <p className="font-semibold">{company?.name ?? "EquipQR"}</p>
          </div>
          {/*
            Q-49/Q-50: Sign out moved to Settings > Account (every role can
            reach it there even though Team/Billing/Settings stay owner-only
            in the nav below) — this header now carries Scan and a direct
            link to that page instead.
          */}
          <div className="flex items-center gap-1.5">
            <DashboardScanButton />
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Account"
              nativeButton={false}
              render={<Link href="/dashboard/settings/account" />}
            >
              <CircleUserRound className="size-5" />
            </Button>
          </div>
        </header>
        <DashboardTopNav isAdmin={!!isAdmin} role={profile.role} kind={kind} requestsBadgeCount={badgeCount} />
        {trialDaysLeft !== null && !onBillingPage && <TrialBanner daysLeft={trialDaysLeft} role={profile.role} />}
        <main id="main-content" className="p-6">
          {isLocked ? <LockedScreen isOwner={profile.role === "owner"} /> : children}
        </main>
      </div>
    </div>
  );
}

// Sends the welcome email and flips companies.welcome_email_sent_at in one
// go. Swallows every error itself — a failure here must never break a
// dashboard page load. The flag is only stamped when the send actually
// succeeded, so a Resend outage leaves it null rather than recording a
// welcome email nobody received.
async function sendWelcomeEmailOnce(
  supabase: Awaited<ReturnType<typeof createClient>>,
  company: Company,
  recipientName: string | null
) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { subject, html, text } = buildWelcomeEmail({
      companyName: company.name,
      kind: company.kind,
      recipientName,
      dashboardUrl: `${appUrl}/dashboard`,
    });

    const sent = await sendEmail({ to: company.notification_email, subject, html, text });
    if (!sent) {
      return;
    }

    await supabase
      .from("companies")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", company.id);
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}
