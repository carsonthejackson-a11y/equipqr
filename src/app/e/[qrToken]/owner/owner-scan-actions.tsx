"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList, Wrench } from "lucide-react";
import { GuideWalkthrough } from "../guide-walkthrough";
import { OpenRequestsCard } from "../open-request-card";
import { cn } from "@/lib/utils";
import type { EquipmentGuide, OpenRequestSummary } from "@/lib/types";

// The owner-kind sibling of ../scan-actions.tsx (docs/OWNER-ROADMAP-BRIEF.md
// §3.3.1). No "Call us"/"Text us" rows — those are the service provider's own
// number, meaningless on an owner's equipment — and "Report a problem" always
// leads to the owner-kind form (symptom chips, site-PIN gate, vendor
// dispatch) rather than the provider-kind one. "Troubleshoot" is kept for
// parity: GuideWalkthrough is guide-content-agnostic, and an owner company
// can have AI-drafted guide steps even though none are seeded by default.

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

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

export function OwnerScanActions({
  guide,
  qrToken,
  aiChatEnabled,
  openRequests = [],
}: {
  guide: EquipmentGuide;
  qrToken: string;
  aiChatEnabled: boolean;
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
      <OpenRequestsCard requests={openRequests} timeZone={guide.company.timezone} />

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
            : "We'll send it to the right vendor"
        }
      />
    </div>
  );
}
