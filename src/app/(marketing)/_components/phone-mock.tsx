import { Camera, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckIcon, Icon } from "./icon";
import { Reveal } from "./reveal";

// README "Phone mock": a 236px bezel with a 452px screen, drawn from Tailwind
// only. The frame is a static illustration (`aria-hidden`); pages assemble a
// screen from the blocks below. Type is 10.5–15px throughout.
//
// Home hero (Home.dc.html):      PhoneHeader → PhonePrompt → PhoneOptions → PhoneInputRow
// Home confirmation:             PhoneCheckCircle → PhoneTitle → PhoneNote → PhoneCard → PhonePhotoGrid → PhonePrimary
// Restaurants report:            PhoneHeader → PhoneQuestion → PhoneChips → PhonePhotoRow → PhoneUrgency → PhonePrimary
// Restaurants confirmation:      PhoneCheckCircle → PhoneTitle → PhoneNote → PhoneCard → PhonePrimary(icon=Phone)

export type PhoneFrameProps = {
  /** Rotation in degrees (±2–3 in the designs). Uses the CSS `rotate` property so `translate-y-*` classes still compose. */
  rotate?: number;
  /** Wrap in a `Reveal` with this delay (the hero phone uses 120). */
  delayMs?: number;
  /** Screen gap; the designs use 9 or 10. */
  gap?: 9 | 10;
  className?: string;
  children: React.ReactNode;
};

export function PhoneFrame({ rotate, delayMs, gap = 10, className, children }: PhoneFrameProps) {
  const frame = (
    <div
      aria-hidden="true"
      style={rotate ? { rotate: `${rotate}deg` } : undefined}
      className={cn(
        "w-[236px] shrink-0 rounded-[38px] border border-eq-neutral-800 bg-eq-bezel p-2 shadow-eq-md",
        className
      )}
    >
      <div
        className={cn(
          "relative flex h-[452px] flex-col overflow-hidden rounded-[30px] bg-eq-surface px-[14px] pt-[42px] pb-4 ring-1 ring-eq-neutral-900 ring-inset",
          gap === 9 ? "gap-[9px]" : "gap-[10px]"
        )}
      >
        <div className="absolute top-3 left-1/2 h-5 w-[72px] -translate-x-1/2 rounded-[10px] bg-eq-bezel" />
        {children}
      </div>
    </div>
  );
  return delayMs !== undefined ? <Reveal delayMs={delayMs} className="shrink-0">{frame}</Reveal> : frame;
}

/** Company kicker + unit name + location line. */
export function PhoneHeader({ kicker, title, subtitle }: { kicker: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <>
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-eq-neutral-500">{kicker}</div>
      <div>
        <div className="text-[14px] leading-[1.25] font-medium">{title}</div>
        {subtitle ? <div className="mt-[2px] text-[11.5px] text-eq-neutral-500">{subtitle}</div> : null}
      </div>
    </>
  );
}

/** A guide step question in a bg-colored bubble. */
export function PhonePrompt({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] bg-eq-bg px-3 py-[11px] text-[12.5px] leading-[1.4]">{children}</div>;
}

/** Small muted label, e.g. "What's happening?". */
export function PhoneQuestion({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-eq-neutral-500">{children}</div>;
}

const selectedClass = "border-primary bg-eq-accent-tint-12 font-medium text-eq-accent-200";

/** Stacked answer rows (Home hero guide step). */
export function PhoneOptions({ items, selectedIndex }: { items: readonly string[]; selectedIndex?: number }) {
  return (
    <div className="flex flex-col gap-[6px]">
      {items.map((item, i) => (
        <div
          key={item}
          className={cn(
            "rounded-md border px-[11px] py-[9px] text-[12px]",
            i === selectedIndex ? selectedClass : "border-eq-neutral-800"
          )}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

/** Symptom chips (Restaurants report screen). */
export function PhoneChips({ items, selectedIndex }: { items: readonly string[]; selectedIndex?: number }) {
  return (
    <div className="flex flex-wrap gap-[6px]">
      {items.map((item, i) => (
        <span
          key={item}
          className={cn(
            "rounded-full border px-[10px] py-[6px] text-[11.5px]",
            i === selectedIndex ? selectedClass : "border-eq-neutral-800"
          )}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

/** Dashed photo attachment row ("Add a photo (optional)", "1 photo added"). */
export function PhonePhotoRow({ label }: { label: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-eq-neutral-700 px-[11px] py-[9px] text-[11.5px] text-eq-neutral-500">
      <Icon icon={Camera} size={16} className="size-[14px]" />
      {label}
    </div>
  );
}

/** Three square photo tiles, the first with a camera glyph. */
export function PhonePhotoGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-[6px]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid aspect-square place-items-center rounded-md bg-eq-neutral-900 text-eq-neutral-500">
          {i === 0 ? <Icon icon={Camera} size={16} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Labelled bg-colored card ("Already tried", "Work order #1043", urgency). */
export function PhoneCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px] rounded-[10px] bg-eq-bg px-3 py-[10px]">
      <div className="text-[10px] uppercase tracking-[0.06em] text-eq-neutral-500">{title}</div>
      <div className="text-[12px] leading-[1.4]">{children}</div>
    </div>
  );
}

/** "How urgent is this?" card with the chosen level. */
export function PhoneUrgency({ label, question = "How urgent is this?" }: { label: React.ReactNode; question?: React.ReactNode }) {
  return (
    <PhoneCard title={question}>
      <span className="font-medium">{label}</span>
    </PhoneCard>
  );
}

/** Bottom-pinned chat input with the accent dot. */
export function PhoneInputRow({ placeholder }: { placeholder: React.ReactNode }) {
  return (
    <div className="mt-auto flex items-center gap-2 rounded-md bg-eq-bg px-[11px] py-[9px] text-[11.5px] text-eq-neutral-500">
      <span className="size-[6px] shrink-0 rounded-full bg-primary" />
      {placeholder}
    </div>
  );
}

/** Bottom-pinned full-width accent-outlined action ("Send work order", "Call Metro Refrigeration"). */
export function PhonePrimary({ label, icon }: { label: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mt-auto flex items-center justify-center gap-2 rounded-md border border-primary p-[10px] text-center text-[12px] font-medium text-primary">
      {icon ? <Icon icon={icon} size={16} className="size-[14px]" /> : null}
      {label}
    </div>
  );
}

/** 36px accent-tinted check circle for confirmation screens. */
export function PhoneCheckCircle() {
  return (
    <div className="grid size-9 place-items-center rounded-full bg-eq-accent-tint-16 text-primary">
      <CheckIcon size={18} />
    </div>
  );
}

/** Confirmation headline ("Request sent"). */
export function PhoneTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[15px] leading-[1.25] font-medium">{children}</div>;
}

/** Secondary sentence under the headline. */
export function PhoneNote({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] leading-[1.45] text-eq-neutral-400">{children}</div>;
}

// ---------------------------------------------------------------------------
// Deprecated: the pre-redesign screens, kept only so the old Home and Features
// pages compile until WS5/WS6 rewrite them. They render placeholder content in
// the new frame. Do not use in new code; remove once no page imports them.
// ---------------------------------------------------------------------------

/** @deprecated Compose a screen from the Phone* blocks instead. */
export function ScanScreen() {
  return (
    <>
      <PhoneHeader kicker="Metro Refrigeration" title="Dish machine · Unit 3" subtitle="Back kitchen · Sunrise Diner" />
      <PhonePrompt>Point your camera at the sticker.</PhonePrompt>
      <PhoneNote>No app to install, no account to make.</PhoneNote>
    </>
  );
}

/** @deprecated Compose a screen from the Phone* blocks instead. */
export function GuideScreen() {
  return (
    <>
      <PhoneHeader kicker="Metro Refrigeration" title="Dish machine · Unit 3" subtitle="Back kitchen · Sunrise Diner" />
      <PhonePrompt>Is water draining at the end of the cycle?</PhonePrompt>
      <PhoneOptions items={["Yes, but slowly", "No, standing water", "It's draining now"]} selectedIndex={1} />
      <PhoneInputRow placeholder="Ask a question about this machine…" />
    </>
  );
}

/** @deprecated Compose a screen from the Phone* blocks instead. */
export function RequestScreen() {
  return (
    <>
      <PhoneCheckCircle />
      <PhoneTitle>Request sent</PhoneTitle>
      <PhoneNote>Metro Refrigeration has your photos and what you already tried.</PhoneNote>
      <PhonePhotoGrid />
      <PhonePrimary label="Call Metro Refrigeration" icon={Phone} />
    </>
  );
}
