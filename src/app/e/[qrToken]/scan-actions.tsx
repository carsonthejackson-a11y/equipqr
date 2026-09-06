"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList, MessageSquare, Phone, Wrench } from "lucide-react";
import { GuideWalkthrough } from "./guide-walkthrough";
import { OpenRequestsCard } from "./open-request-card";
import { phoneHref, type ResolvedBranding } from "@/lib/branding";
import { cn } from "@/lib/utils";
import type { EquipmentGuide, OpenRequestSummary } from "@/lib/types";

// The four things a customer standing in front of a broken machine might
// want, in the order they'd want them: try to fix it, tell someone, call,
// text. Every target is at least 56px tall — this is used one-handed, often
// with gloves on, on a phone held at arm's length.
//
// Troubleshooting opens in place rather than on its own route so the guide
// keeps its state if the customer backs out of it and tries again.
//
// When the unit already has an open request (Next roadmap, migration 0019),
// the "already reported" card above takes the primary-action slot instead of
// a sessionStorage-remembered chip: `openRequests` comes straight off
// resolve_qr_code() so it works for ANY visitor who scans the sticker, not
// just the browser that submitted it.

type Mode = "menu" | "troubleshoot";

function ActionRow({
  href,
  onClick,
  icon,
  title,
  subtitle,
  primary,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  primary?: boolean;
}) {
  const className = cn(
    "flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors active:translate-y-px",
    primary
      ? "border-transparent bg-[var(--brand)] text-[var(--brand-on)]"
      : "bg-background hover:bg-muted"
  );

  const inner = (
    <>
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-base leading-tight font-semibold">{title}</span>
        {subtitle && (
          <span className={cn("block text-sm leading-tight", primary ? "opacity-80" : "text-muted-foreground")}>
            {subtitle}
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 opacity-50" aria-hidden />
    </>
  );

  // `tel:`/`sms:` hand off to another app — those must stay plain anchors;
  // only in-app routes go through <Link>.
  if (href?.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export function ScanActions({
  guide,
  qrToken,
  branding,
  aiChatEnabled,
  openRequests = [],
}: {
  guide: EquipmentGuide;
  qrToken: string;
  branding: ResolvedBranding;
  aiChatEnabled: boolean;
  /** Open requests on this unit from resolve_qr_code() — Next roadmap (workstream B renders these). */
  openRequests?: OpenRequestSummary[];
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const hasGuide = guide.steps.length > 0;
  const hasOpenRequest = openRequests.length > 0;

  if (mode === "troubleshoot") {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <button
          type="button"
          onClick={() => setMode("menu")}
          className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 self-start px-1 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </button>
        <GuideWalkthrough guide={guide} qrToken={qrToken} aiChatEnabled={aiChatEnabled} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <OpenRequestsCard requests={openRequests} />

      {hasGuide && (
        <ActionRow
          primary
          icon={<Wrench className="size-5" />}
          title="Troubleshoot"
          subtitle="A few quick questions — often fixes it"
          onClick={() => setMode("troubleshoot")}
        />
      )}

      <ActionRow
        primary={!hasGuide && !hasOpenRequest}
        href={`/e/${qrToken}/request`}
        icon={<ClipboardList className="size-5" />}
        title={hasOpenRequest ? "Report a different problem" : "Report a problem"}
        subtitle={
          hasOpenRequest
            ? "Already reported? Add a note above instead."
            : "Send photos and we'll get back to you"
        }
      />

      {branding.phone && (
        <ActionRow
          href={phoneHref("tel", branding.phone)}
          icon={<Phone className="size-5" />}
          title="Call us"
          subtitle={branding.phone}
        />
      )}

      {branding.smsNumber && (
        <ActionRow
          href={phoneHref("sms", branding.smsNumber)}
          icon={<MessageSquare className="size-5" />}
          title="Text us"
          subtitle={branding.smsNumber}
        />
      )}
    </div>
  );
}
