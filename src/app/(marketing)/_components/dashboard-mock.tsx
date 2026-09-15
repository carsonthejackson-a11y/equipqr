import { MapPin } from "lucide-react";
import { LogoMarkSmall, WORDMARK_CLASS } from "@/components/logo";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { Tag } from "./tag";

// Static dashboard illustrations, 12–13px type, always `aria-hidden`.
//
// Home §4 "The dashboard": DashboardFrame (browser chrome + optional sidebar)
//   → DashboardToolbar, DashboardStats/DashboardStat, DashboardTable/DashboardRow.
// Restaurants "What you see": DashboardCard → DashboardHeader,
//   DashboardLocationRow, DashboardSectionLabel + DashboardVendorGrid/
//   DashboardVendorCard, DashboardProgress.

// ---------------------------------------------------------------- frame ---

export type DashboardFrameProps = {
  /** URL shown in the chrome bar. */
  url?: string;
  /** A `<DashboardSidebar>`; omitted = single-column main panel. */
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/** Browser-chrome frame on the bezel color with a `208px | 1fr` grid (sidebar hides ≤ 820px). */
export function DashboardFrame({ url = "app.equipqr.co/dashboard/requests", sidebar, children, className }: DashboardFrameProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("overflow-hidden rounded-[16px] border border-eq-neutral-800 bg-eq-bezel shadow-eq-md", className)}
    >
      <div className="flex items-center gap-2 border-b border-eq-neutral-900 px-4 py-3">
        <span className="size-[10px] rounded-full bg-eq-neutral-800" />
        <span className="size-[10px] rounded-full bg-eq-neutral-800" />
        <span className="size-[10px] rounded-full bg-eq-neutral-800" />
        <span className="ml-3 rounded-[6px] bg-eq-bg px-3 py-1 text-[12px] text-eq-neutral-500">{url}</span>
      </div>
      <div className={cn("grid", sidebar ? "grid-cols-[208px_minmax(0,1fr)] max-[820px]:grid-cols-1" : "grid-cols-1")}>
        {sidebar}
        <div className="flex min-w-0 flex-col gap-4 p-[clamp(14px,2vw,22px)]">{children}</div>
      </div>
    </div>
  );
}

export type DashboardSidebarItem = {
  label: string;
  /** Right-aligned count. */
  count?: string | number;
  /** Count in accent (the active queue). */
  countAccent?: boolean;
  active?: boolean;
};

export function DashboardSidebar({ items, footer }: { items: readonly DashboardSidebarItem[]; footer?: React.ReactNode }) {
  return (
    <aside className="flex flex-col gap-[2px] border-r border-eq-neutral-900 px-3 py-4 text-[13px] max-[820px]:hidden">
      <div className="flex items-center gap-2 px-[10px] pt-[6px] pb-[14px]">
        <LogoMarkSmall className="size-[18px] text-eq-accent" />
        <span className={cn(WORDMARK_CLASS, "text-[14px]")}>EquipQR</span>
      </div>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex justify-between rounded-[6px] px-[10px] py-[7px]",
            item.active ? "bg-foreground/[0.06] text-eq-text" : "text-eq-neutral-400"
          )}
        >
          <span>{item.label}</span>
          {item.count !== undefined ? (
            <span className={cn("tabular-nums", item.countAccent ? "text-primary" : "text-eq-neutral-600")}>{item.count}</span>
          ) : null}
        </div>
      ))}
      {footer ? (
        <div className="mt-auto border-t border-eq-neutral-900 px-[10px] pt-[14px] pb-1 text-[12px] text-eq-neutral-500">{footer}</div>
      ) : null}
    </aside>
  );
}

/** Panel title + filter chips row. */
export function DashboardToolbar({ title, chips }: { title: React.ReactNode; chips: readonly { label: string; active?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-[17px] font-medium">{title}</div>
      <div className="flex flex-wrap gap-[6px] text-[12px]">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className={cn(
              "rounded-[6px] px-[10px] py-[5px]",
              chip.active
                ? "text-primary shadow-[inset_0_0_0_1px_var(--eq-accent)]"
                : "text-eq-neutral-400 shadow-[inset_0_0_0_1px_var(--eq-neutral-800)]"
            )}
          >
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardStats({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-[10px]">{children}</div>;
}

export function DashboardStat({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-eq-surface px-[14px] py-3">
      <span className="text-[11px] text-eq-neutral-500">{label}</span>
      <span className="text-[22px] font-medium tracking-[-0.02em] tabular-nums">{value}</span>
    </div>
  );
}

const rowGrid = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(128px,1.1fr)_56px] gap-3 px-[14px] max-[700px]:grid-cols-[minmax(0,1.5fr)_minmax(128px,1.1fr)_56px]";
const optionalCol = "max-[700px]:hidden";

/** Request list frame; `columns` = 5 header labels (Equipment · Reported · Urgency · Status · Age). */
export function DashboardTable({ columns, children }: { columns: readonly [string, string, string, string, string]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-eq-neutral-900 text-[13px]">
      <div className={cn(rowGrid, "border-b border-eq-neutral-900 py-[10px] text-[11px] uppercase tracking-[0.06em] text-eq-neutral-500")}>
        <span>{columns[0]}</span>
        <span className={optionalCol}>{columns[1]}</span>
        <span className={optionalCol}>{columns[2]}</span>
        <span>{columns[3]}</span>
        <span className="text-right">{columns[4]}</span>
      </div>
      {children}
    </div>
  );
}

export type DashboardRowProps = {
  title: React.ReactNode;
  subtitle: React.ReactNode;
  reported: React.ReactNode;
  urgency: React.ReactNode;
  /** A `<Tag>` or plain text. */
  status: React.ReactNode;
  age: React.ReactNode;
};

export function DashboardRow({ title, subtitle, reported, urgency, status, age }: DashboardRowProps) {
  return (
    <div className={cn(rowGrid, "items-center border-b border-eq-neutral-900 py-3 transition-colors duration-150 last:border-b-0 hover:bg-foreground/[0.04]")}>
      <div className="min-w-0">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-[11.5px] text-eq-neutral-500">{subtitle}</div>
      </div>
      <div className={cn(optionalCol, "truncate text-eq-neutral-300")}>{reported}</div>
      <div className={cn(optionalCol, "text-eq-neutral-400")}>{urgency}</div>
      <div>{status}</div>
      <div className="text-right text-eq-neutral-500 tabular-nums">{age}</div>
    </div>
  );
}

// ----------------------------------------------------------- owner card ---

/** The Restaurants owner mock surface: 14px radius, shadow-md, 12.5px type. */
export function DashboardCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-eq-neutral-800 bg-eq-surface p-[18px] text-[12.5px] shadow-eq-md",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Name + meta line with a tag on the right ("Sunrise Diner · 2 locations…" + `Multi-kitchen`). */
export function DashboardHeader({ title, meta, tag }: { title: React.ReactNode; meta?: React.ReactNode; tag?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[14px] font-medium">{title}</div>
        {meta ? <div className="mt-[2px] text-[11.5px] text-eq-neutral-500">{meta}</div> : null}
      </div>
      {tag}
    </div>
  );
}

/** Location row with a pin icon; `meta` can include accent spans ("14 units · 1 open"). */
export function DashboardLocationRow({ name, meta }: { name: React.ReactNode; meta: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[10px] rounded-md bg-eq-bg px-3 py-[10px]">
      <div className="flex items-center gap-2 font-medium">
        <Icon icon={MapPin} size={16} className="size-[14px] text-primary" />
        {name}
      </div>
      <div className="whitespace-nowrap text-eq-neutral-500">{meta}</div>
    </div>
  );
}

export function DashboardSectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[10.5px] uppercase tracking-[0.06em] text-eq-neutral-500", className)}>{children}</div>;
}

/** Two-up vendor cards, single column ≤ 560px. */
export function DashboardVendorGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 max-[560px]:grid-cols-1">{children}</div>;
}

export function DashboardVendorCard({ title, children, empty = false }: { title: React.ReactNode; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className={cn("rounded-md border px-3 py-[10px]", empty ? "border-dashed border-eq-neutral-700" : "border-eq-neutral-900")}>
      <div className="font-medium">{title}</div>
      <div className="mt-[2px] leading-[1.4] text-eq-neutral-500">{children}</div>
    </div>
  );
}

export type DashboardProgressStep = {
  label: string;
  /** Timestamp or "—". */
  time: string;
  done?: boolean;
};

/** Work-order progress: dots joined by lines, completed steps in accent, with a label grid under it. */
export function DashboardProgress({ title, tag, steps }: { title?: React.ReactNode; tag?: React.ReactNode; steps: readonly DashboardProgressStep[] }) {
  return (
    <div>
      {title || tag ? (
        <div className="mb-[10px] flex items-center justify-between gap-[10px]">
          {title ? <DashboardSectionLabel>{title}</DashboardSectionLabel> : <span />}
          {tag}
        </div>
      ) : null}
      <div className="flex items-center">
        {steps.map((step, i) => (
          <span key={step.label} className="contents">
            <span
              className={cn(
                "size-[10px] shrink-0 rounded-full",
                step.done ? "bg-primary" : "border border-eq-neutral-600"
              )}
            />
            {i < steps.length - 1 ? (
              <span className={cn("h-px flex-1", step.done && steps[i + 1]?.done ? "bg-primary" : "bg-eq-neutral-700")} />
            ) : null}
          </span>
        ))}
      </div>
      <div
        className="mt-2 grid gap-1 text-[10.5px] leading-[1.3] [overflow-wrap:anywhere]"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <div
            key={step.label}
            className={cn(!step.done && "text-eq-neutral-500", i === steps.length - 1 && "text-right")}
          >
            <div className={cn(step.done && "font-medium")}>{step.label}</div>
            <div className="whitespace-nowrap text-eq-neutral-500">{step.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Convenience re-export so mock rows can use the same status tags. */
export { Tag as DashboardTag };
