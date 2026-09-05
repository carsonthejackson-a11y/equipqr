"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList, MessageSquare, Phone, Wrench } from "lucide-react";
import { GuideWalkthrough } from "./guide-walkthrough";
import { openRequestStorageKey } from "@/lib/public-request";
import { phoneHref, type ResolvedBranding } from "@/lib/branding";
import { cn } from "@/lib/utils";
import type { EquipmentGuide } from "@/lib/types";

// The four things a customer standing in front of a broken machine might
// want, in the order they'd want them: try to fix it, tell someone, call,
// text. Every target is at least 56px tall — this is used one-handed, often
// with gloves on, on a phone held at arm's length.
//
// Troubleshooting opens in place rather than on its own route so the guide
// keeps its state if the customer backs out of it and tries again.

type Mode = "menu" | "troubleshoot";

// The value only changes when this page navigates away and back, which
// remounts the component anyway — there is nothing to subscribe to.
const subscribeNever = () => () => {};

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
}: {
  guide: EquipmentGuide;
  qrToken: string;
  branding: ResolvedBranding;
  aiChatEnabled: boolean;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const hasGuide = guide.steps.length > 0;

  // Best-effort "you already told us about this one" chip, read straight out
  // of sessionStorage. useSyncExternalStore rather than an effect so the
  // server snapshot is `null` (nothing to hydrate-mismatch on) and the value
  // appears on the client's first commit. sessionStorage throws outright in
  // some locked-down browsers, so the read is guarded; nothing else on this
  // page depends on it.
  const openRequestUrl = useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return sessionStorage.getItem(openRequestStorageKey(qrToken));
      } catch {
        return null;
      }
    },
    () => null
  );

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
      {openRequestUrl && (
        <a
          href={openRequestUrl}
          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-4 py-2.5 text-sm font-medium"
        >
          <ClipboardList className="size-4 shrink-0 text-[var(--brand)]" aria-hidden />
          <span className="flex-1">You have a request in progress</span>
          <span className="underline">View status</span>
        </a>
      )}

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
        primary={!hasGuide}
        href={`/e/${qrToken}/request`}
        icon={<ClipboardList className="size-5" />}
        title="Report a problem"
        subtitle="Send photos and we'll get back to you"
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
