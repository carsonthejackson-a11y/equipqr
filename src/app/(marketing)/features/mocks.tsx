import { Camera, Mail, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckIcon, Icon } from "../_components/icon";
import { Tag } from "../_components/tag";
import { FakeQr, TagMock } from "../_components/tag-mock";

// Static illustrations for /features that the WS3 blocks don't cover, drawn
// from Features.dc.html: the guide step list, the assistant thread, the
// routed work order, the request email, the unit history, the branding pair
// with the customer page frame, the sticker batch sheet and the instruction
// tag. All decorative; FeatureRow's visual column is already `aria-hidden`.

const COMPANY = "Metro Refrigeration";
const PHONE = "(214) 555-0142";

/** Design mock card: 14px radius, neutral-800 border, surface, 18px padding, shadow-md, 12.5px type. */
function MockCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-[14px] border border-eq-neutral-800 bg-eq-surface p-[18px] text-[12.5px] shadow-eq-md",
        className
      )}
      {...props}
    />
  );
}

const uppercaseLabel = "text-[10.5px] uppercase tracking-[0.06em] text-eq-neutral-500";
const outlineAction = "flex-1 rounded-md border p-2 text-center font-medium";
const primaryAction = cn(outlineAction, "border-primary text-primary");
const neutralAction = cn(outlineAction, "border-eq-neutral-700");

/** Dashed "logo" drop target (README "Fidelity": empty until a real asset exists). */
function LogoSlot({ className, label = "Logo" }: { className?: string; label?: string }) {
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-[4px] border border-dashed border-current/30 text-[9px] opacity-70",
        className
      )}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome 01
// ---------------------------------------------------------------------------

const guideBranches: { answer: string; next?: string; outcomes: { label: string; variant: "accent" | "neutral" | "outline" }[] }[] = [
  {
    answer: "No lights at all",
    next: "Check the breaker and the cord",
    outcomes: [
      { label: "Fixed", variant: "accent" },
      { label: "Request service", variant: "outline" },
    ],
  },
  { answer: "Powers on, no water flow", next: "Is the supply valve open?", outcomes: [{ label: "Keep going", variant: "neutral" }] },
  { answer: "Runs, but not draining", next: "Pull the drain screen. Clear?", outcomes: [{ label: "Keep going", variant: "neutral" }] },
  { answer: "It's working now", outcomes: [{ label: "Fixed", variant: "accent" }] },
];

const guideStep = "rounded-md border border-eq-neutral-800 bg-eq-bg px-[11px] py-2 whitespace-nowrap";

/** Drafted troubleshooting guide with its branch tree. */
export function GuideMock() {
  return (
    <MockCard className="gap-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium">Dish machine · Troubleshooting guide</div>
          <div className="mt-[2px] text-[11.5px] text-eq-neutral-500">Drafted 2 min ago · 6 steps · 3 outcomes</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Tag variant="neutral">Draft</Tag>
          <span className="rounded-[6px] border border-primary px-[10px] py-1 text-[12px] font-medium whitespace-nowrap text-primary">
            Publish
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-primary bg-[color-mix(in_srgb,var(--eq-accent)_10%,transparent)] px-3 py-[9px] font-medium">
          Is the machine powering on?
        </div>
        <div className="ml-[14px] flex flex-col gap-2 border-l border-eq-neutral-700 pt-[2px]">
          {guideBranches.map((branch) => (
            <div key={branch.answer} className="flex items-center">
              <div className="h-px w-[14px] shrink-0 bg-eq-neutral-700" />
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <div className={guideStep}>{branch.answer}</div>
                <span className="text-eq-neutral-600">→</span>
                {branch.next ? (
                  <>
                    <div className={guideStep}>{branch.next}</div>
                    <span className="text-eq-neutral-600">→</span>
                  </>
                ) : null}
                {branch.outcomes.map((outcome) => (
                  <Tag key={outcome.label} variant={outcome.variant}>
                    {outcome.label}
                  </Tag>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-eq-neutral-900 pt-3 text-[12px] text-eq-neutral-500">
        <span>Edit any step · Add a photo · Reorder branches</span>
        <span className="text-eq-neutral-400">Applies to 38 dish machines</span>
      </div>
    </MockCard>
  );
}

const userBubble =
  "self-end max-w-[85%] rounded-[12px_12px_4px_12px] bg-[color-mix(in_srgb,var(--eq-accent)_14%,transparent)] px-3 py-[9px] leading-[1.45] text-eq-accent-100";
const assistantBubble = "self-start max-w-[90%] rounded-[12px_12px_12px_4px] bg-eq-bg px-3 py-[9px] leading-[1.5] text-eq-neutral-200";

/** Chat-style assistant thread beside the guide. */
export function AssistantMock() {
  return (
    <div className="flex w-full max-w-[360px] flex-col gap-[10px] rounded-[14px] border border-eq-neutral-800 bg-eq-surface p-4 text-[12.5px] shadow-eq-md">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.06em] text-eq-neutral-500">
        <Icon icon={MessageSquare} size={16} className="size-[14px] text-primary" />
        Assistant · Dish machine, Unit 3
      </div>
      <div className={userBubble}>Where is the drain screen on this model?</div>
      <div className={assistantBubble}>
        {
          "Open the door and lift out the lower wash arm. The drain screen is the flat mesh tray under it, at the back of the tank. Pull it straight up. If it's full of debris, rinse it and re-run a cycle before doing anything else."
        }
      </div>
      <div className={userBubble}>Cleared it, still standing water.</div>
      <div className={assistantBubble}>
        {
          "Then it's likely the drain pump or solenoid, which needs a technician. I'll note what you tried. Want to send the request now?"
        }
      </div>
      <div className="mt-[2px] flex gap-2">
        <div className={primaryAction}>Request service</div>
        <div className={cn(neutralAction, "font-normal")}>Keep trying</div>
      </div>
    </div>
  );
}

const routingSteps = [
  { label: "Sent", time: "7:41 pm", done: true },
  { label: "Opened", time: "7:44 pm", done: true },
  { label: "Ack'd", time: "7:52 pm", done: true },
  { label: "ETA", time: "—", done: false },
  { label: "Finished", time: "—", done: false },
];

/** Work order routed to the vendor on file. */
export function RoutingMock() {
  return (
    <MockCard className="gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">Walk-in cooler · Dry storage</div>
          <div className="mt-[2px] text-[11.5px] text-eq-neutral-500">Sunrise Diner · Work order #1042</div>
        </div>
        <Tag>Acknowledged</Tag>
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="rounded-md bg-eq-bg px-3 py-[10px]">
          <div className={uppercaseLabel}>Routed to</div>
          <div className="mt-[3px] font-medium">{COMPANY}</div>
          <div className="mt-px text-eq-neutral-500">Default for Refrigeration · responds within 2 h</div>
        </div>
        <div className="rounded-md bg-eq-bg px-3 py-[10px]">
          <div className={uppercaseLabel}>Reported by</div>
          <div className="mt-[3px] font-medium">Line cook, 7:41 pm</div>
          <div className="mt-px text-eq-neutral-500">Reading 46°F · Urgent · 1 photo</div>
        </div>
      </div>
      <div>
        <div className="flex items-center">
          {routingSteps.map((step, i) => (
            <span key={step.label} className="contents">
              <span
                className={cn(
                  "size-[10px] shrink-0 rounded-full",
                  step.done ? "bg-primary" : "box-border border border-eq-neutral-600"
                )}
              />
              {i < routingSteps.length - 1 ? (
                <span className={cn("h-px flex-1", routingSteps[i + 1].done ? "bg-primary" : "bg-eq-neutral-700")} />
              ) : null}
            </span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1 text-[10.5px] leading-[1.3] [overflow-wrap:anywhere] tabular-nums">
          {routingSteps.map((step, i) => (
            <div
              key={step.label}
              className={cn(!step.done && "text-eq-neutral-500", i === routingSteps.length - 1 && "text-right")}
            >
              <div className={cn(step.done && "font-medium")}>{step.label}</div>
              <div className={cn("whitespace-nowrap", step.done && "text-eq-neutral-500")}>{step.time}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-dashed border-eq-neutral-700 px-3 py-[9px] text-eq-neutral-400">
        <Icon icon={Mail} size={16} className="size-[14px] text-primary" />
        {"If no acknowledgement within 2 h, the owner is emailed with the vendor's phone number."}
      </div>
    </MockCard>
  );
}

// ---------------------------------------------------------------------------
// Outcome 02
// ---------------------------------------------------------------------------

/** The dispatch email with the AI summary. */
export function RequestEmailMock() {
  return (
    <MockCard className="gap-3">
      <div className="flex items-center gap-[10px]">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-eq-accent-tint-16 text-primary">
          <Icon icon={Mail} size={16} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">New request: Dish machine, Unit 3 · Sunrise Diner</div>
          <div className="mt-[2px] text-[11px] text-eq-neutral-500">requests@equipqr.co · to dispatch@metrorefrig.com · 7:46 pm</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Tag variant="neutral">{"Can't operate without it"}</Tag>
        <Tag variant="neutral">Not draining</Tag>
        <Tag variant="neutral">3 photos · 1 video</Tag>
      </div>
      <div className="flex flex-col gap-1.5 rounded-[10px] bg-eq-bg p-3">
        <div className={uppercaseLabel}>AI summary</div>
        <div className="leading-[1.5] text-eq-neutral-200">
          Standing water after the cycle since about 7:15 pm. Staff cleared the drain screen and confirmed the float
          switch moves freely; no change. Machine powers on and fills normally. Likely drain pump or drain solenoid.
          Bring both; last service on this unit was a wash-arm replacement, Aug 30.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Contact", "Dana R. · GM"],
          ["Model", "AM15 · SN 23-0417"],
          ["Site hours", "6 am – 11 pm"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-eq-neutral-900 px-[10px] py-2">
            <div className="text-[10.5px] text-eq-neutral-500">{label}</div>
            <div className="mt-[2px] font-medium tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className={primaryAction}>Acknowledge</div>
        <div className={neutralAction}>Give an ETA</div>
        <div className={neutralAction}>Open in dashboard</div>
      </div>
    </MockCard>
  );
}

const historyEvents = [
  { date: "Sep 12", title: "Guide completed, resolved at step 4", detail: "Drain screen cleared by staff. No request filed.", accent: true },
  { date: "Aug 30", title: "Service request: not heating → Done", detail: "Wash-arm replaced. 52 min on site · J. Alvarez" },
  { date: "Aug 3", title: "Quarterly inspection checklist", detail: "12 of 12 passed · Walked from the tag" },
  { date: "Jul 15", title: "Tagged via nameplate photo", detail: "Make, model, and serial filled in on-site" },
];

/** The unit's event history. */
export function HistoryMock() {
  return (
    <MockCard className="gap-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">Dish machine · Unit 3</div>
          <div className="mt-[2px] text-[11.5px] text-eq-neutral-500">Sunrise Diner · Back kitchen · Tagged Jul 15</div>
        </div>
        <span className="text-[11px] whitespace-nowrap text-eq-neutral-500">History · 9 events</span>
      </div>
      <div className="grid grid-cols-[56px_12px_minmax(0,1fr)] gap-x-[10px]">
        {historyEvents.map((event, i) => {
          const last = i === historyEvents.length - 1;
          return (
            <div key={event.date} className="contents">
              <div className="py-1.5 text-eq-neutral-500 tabular-nums">{event.date}</div>
              <div className="flex flex-col items-center">
                <span className={cn("mt-[10px] size-2 shrink-0 rounded-full", event.accent ? "bg-primary" : "bg-eq-neutral-500")} />
                {last ? null : <span className="w-px flex-1 bg-eq-neutral-800" />}
              </div>
              <div className={cn("pt-1.5", last ? "pb-0" : "pb-[14px]")}>
                <div className="font-medium">{event.title}</div>
                <div className="mt-[2px] text-eq-neutral-500">{event.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </MockCard>
  );
}

// ---------------------------------------------------------------------------
// Outcome 03
// ---------------------------------------------------------------------------

/** Default vs. branded sticker, plus the customer page frame. */
export function BrandingMock() {
  return (
    <div className="flex w-full flex-col gap-[14px]">
      <div className="flex flex-wrap justify-center gap-5">
        <figure className="m-0 flex flex-col items-center gap-[10px]">
          <TagMock company={COMPANY} unit="Dish machine · Unit 3" />
          <figcaption className="text-[12px] text-eq-neutral-500">Default</figcaption>
        </figure>
        <figure className="m-0 flex flex-col items-center gap-[10px]">
          <TagMock variant="branded" company={COMPANY} phone={PHONE} />
          <figcaption className="text-[12px] text-eq-neutral-500">Your logo and colors</figcaption>
        </figure>
      </div>
      <div className="overflow-hidden rounded-[12px] border border-eq-neutral-800 bg-eq-surface text-[12px] shadow-eq-sm">
        <div className="h-1 bg-eq-neutral-300" />
        <div className="flex items-center justify-between gap-3 border-b border-eq-neutral-900 px-[14px] py-3">
          <div className="flex items-center gap-[10px]">
            <LogoSlot className="size-7" />
            <span className="text-[13px] font-medium">{COMPANY}</span>
          </div>
          <span className="text-eq-neutral-500">Dish machine · Unit 3</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-[14px] py-3">
          <span className="text-eq-neutral-400">Customer page in your colors, with your phone number one tap away</span>
          <span className="text-[10.5px] text-eq-neutral-600">Powered by EquipQR</span>
        </div>
      </div>
    </div>
  );
}

const batchTiles = [true, true, true, true, false, false, false, false, false, false, false, false];

/** Blank-code batch sheet with the nameplate claim. */
export function BatchMock() {
  return (
    <MockCard className="gap-[14px]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-medium">Sticker batch · Route 14</div>
        <Tag variant="neutral">30 codes · 12 claimed</Tag>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {batchTiles.map((claimed, i) => (
          <div
            key={i}
            className={cn(
              "grid aspect-square place-items-center rounded-[6px] border bg-eq-bg",
              claimed ? "border-primary text-primary" : "border-eq-neutral-800 text-eq-neutral-600"
            )}
          >
            {claimed ? <CheckIcon size={16} className="size-[14px]" /> : <FakeQr size={18} />}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-[10px] bg-eq-bg p-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-eq-neutral-900 text-eq-neutral-500">
          <Icon icon={Camera} size={18} />
        </div>
        <div className="min-w-0 leading-[1.45]">
          <div className="font-medium">Claimed from nameplate photo</div>
          <div className="text-eq-neutral-500">Hobart AM15 · SN 23-0417 · 208V 3-ph · Sunrise Diner, Back kitchen</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-[12px]">
        {["Download SVG", "Download PNG", "Print label sheet · 30 up"].map((label) => (
          <span key={label} className="rounded-[6px] border border-eq-neutral-700 px-[10px] py-[5px]">
            {label}
          </span>
        ))}
      </div>
    </MockCard>
  );
}

/** 2 × 2 in "Instruction" tag: three steps and the phone number on the sticker. */
export function InstructionTagMock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-[176px] shrink-0 flex-col justify-between rounded-[12px] bg-eq-neutral-100 p-[14px] text-eq-bg shadow-eq-md",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em]">Problem?</span>
        <span className="text-[9px] opacity-70">Unit 3</span>
      </div>
      <div className="flex items-center gap-[10px]">
        <FakeQr size={66} />
        <div className="text-[9.5px] leading-[1.35]">
          <div className="font-medium">1. Scan</div>
          <div>2. Try the guide</div>
          <div>3. Send request</div>
        </div>
      </div>
      <div className="border-t border-[rgba(22,24,38,0.2)] pt-2">
        <div className="text-[10px] leading-[1.25] font-medium">{COMPANY}</div>
        <div className="mt-px text-[9px] opacity-75">{PHONE} · 24 h emergency</div>
      </div>
    </div>
  );
}
