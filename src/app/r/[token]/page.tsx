import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { CalendarClock, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { resolveBranding } from "@/lib/branding";
import { getCompanyPlanFlags } from "@/lib/billing";
import { checkRateLimit, getClientIpFromHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { formatRelativeTime } from "@/lib/format";
import { REQUEST_STATUS_LABELS } from "@/components/status-badge";
import { BrandHeader, BrandShell, ContactActions, PoweredBy } from "@/components/public/brand-shell";
import type { PublicRequestStatusWithCompanyId, RequestStatus } from "@/lib/types";

// The customer's window into a request they submitted. Reached from the
// confirmation screen and from every status email. No login, no JS — the
// whole page renders server-side, so it works on a locked-down work phone
// and in an email client's in-app browser.
//
// The token is unguessable and get_request_status() already trims the row
// down to what the requester is entitled to see (no ids, no internal notes,
// no other requests), so there is nothing to hide client-side.

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<RequestStatus, string> = {
  new: "bg-[var(--brand)]/15 text-[var(--brand)] border-[var(--brand)]/30",
  in_progress: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
  scheduled: "bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-400",
  on_hold: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
  resolved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  canceled: "bg-slate-500/10 text-muted-foreground border-slate-500/30",
};

/** What the status actually means for the person waiting, in their words. */
const STATUS_BLURB: Record<RequestStatus, string> = {
  new: "We've got your request and it's in the queue.",
  in_progress: "Someone is working on it now.",
  scheduled: "A visit is booked.",
  on_hold: "This is paused for now — we'll be in touch.",
  resolved: "This one's done.",
  canceled: "This request was canceled.",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** First name only — the customer needs to know who's coming, not the staff directory. */
function firstName(fullName: string | null): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function SlowDownPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <h1 className="text-xl font-semibold">One moment</h1>
      <p className="text-muted-foreground">
        That&apos;s a lot of refreshing. Give it a minute and reload the page — your request is
        safe.
      </p>
    </div>
  );
}

export default async function RequestStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Token guessing is impractical (128 bits), but the lookup is still an
  // unauthenticated DB round-trip anyone can drive, so it gets a per-IP cap.
  const headerList = await headers();
  const allowed = await checkRateLimit(
    `rs:ip:${getClientIpFromHeaders(headerList)}`,
    RATE_LIMITS.requestStatusPerIp
  );
  if (!allowed) return <SlowDownPage />;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_request_status", { p_public_token: token });
  const status = data as PublicRequestStatusWithCompanyId | null;

  if (!status) {
    notFound();
  }

  const planFlags = await getCompanyPlanFlags(status.company.id);

  const branding = resolveBranding({
    company: status.company,
    planId: planFlags?.plan_id,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  });

  const technician = firstName(status.assigned_to_name);
  const isResolved = status.status === "resolved";

  return (
    <BrandShell branding={branding}>
      <BrandHeader branding={branding} />

      <main className="flex flex-1 flex-col gap-6 px-4 pt-5 pb-2">
        <div className="space-y-3">
          <span
            className={`inline-flex items-center rounded-full border px-4 py-1.5 text-base font-semibold ${STATUS_PILL[status.status]}`}
          >
            {REQUEST_STATUS_LABELS[status.status]}
          </span>
          <div>
            <h1 className="text-2xl leading-tight font-semibold">{status.equipment.name}</h1>
            {status.equipment.location && (
              <p className="text-muted-foreground">{status.equipment.location}</p>
            )}
          </div>
          <p>{STATUS_BLURB[status.status]}</p>
          <p className="text-sm text-muted-foreground">
            Submitted {formatRelativeTime(status.created_at)} · Updated{" "}
            {formatRelativeTime(status.status_updated_at)}
          </p>
        </div>

        {status.scheduled_for && (
          <div className="flex items-start gap-3 rounded-xl border px-4 py-3">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" aria-hidden />
            <div>
              <p className="font-medium">Visit scheduled</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(status.scheduled_for)}</p>
            </div>
          </div>
        )}

        {technician && (
          <div className="flex items-start gap-3 rounded-xl border px-4 py-3">
            <UserRound className="mt-0.5 size-5 shrink-0 text-[var(--brand)]" aria-hidden />
            <div>
              <p className="font-medium">{technician} is on it</p>
              <p className="text-sm text-muted-foreground">
                Your technician from {branding.companyName}
              </p>
            </div>
          </div>
        )}

        {isResolved && status.resolution_summary && (
          <section className="space-y-2 rounded-xl border bg-muted/40 px-4 py-3">
            <h2 className="font-semibold">What we did</h2>
            <p className="text-sm whitespace-pre-wrap">{status.resolution_summary}</p>
            {status.resolution_recommendations && (
              <>
                <h3 className="pt-2 font-semibold">Recommendations</h3>
                <p className="text-sm whitespace-pre-wrap">{status.resolution_recommendations}</p>
              </>
            )}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="font-semibold">What you told us</h2>
          <p className="rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap">
            {status.description}
          </p>
        </section>

        {status.activity.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-semibold">Updates</h2>
            <ol className="space-y-3 border-l pl-4">
              {status.activity.map((entry, index) => (
                <li key={`${entry.created_at}-${index}`} className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-[var(--brand)]"
                  />
                  {entry.body && <p className="text-sm whitespace-pre-wrap">{entry.body}</p>}
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(branding.phone || branding.smsNumber) && (
          <section className="space-y-2">
            <h2 className="font-semibold">Something changed?</h2>
            <p className="text-sm text-muted-foreground">
              Get in touch with {branding.companyName} and mention this request.
            </p>
            <ContactActions branding={branding} />
          </section>
        )}
      </main>

      <PoweredBy />
    </BrandShell>
  );
}
