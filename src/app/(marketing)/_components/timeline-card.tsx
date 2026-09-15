import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { Tag } from "./tag";

// Restaurants "It's 7:40 pm on a Friday." card: header line + accent tag, rows
// in a `56px 12px 1fr` grid with dot-and-line connectors (first dot neutral,
// later dots accent), dashed footer note. Static illustration.

export type TimelineRow = {
  /** e.g. "7:40 pm" */
  time: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
};

export type TimelineCardProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Tag text, e.g. "Sent". */
  tag?: React.ReactNode;
  rows: readonly TimelineRow[];
  /** Dashed footer note with a mail icon. */
  note?: React.ReactNode;
  className?: string;
};

export function TimelineCard({ title, subtitle, tag, rows, note, className }: TimelineCardProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex flex-col gap-[14px] rounded-xl border border-eq-neutral-800 bg-eq-surface p-[18px] text-[12.5px] shadow-eq-md",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">{title}</div>
          {subtitle ? <div className="mt-[2px] text-[11.5px] text-eq-neutral-500">{subtitle}</div> : null}
        </div>
        {tag ? <Tag>{tag}</Tag> : null}
      </div>
      <div className="grid grid-cols-[56px_12px_minmax(0,1fr)] gap-x-[10px]">
        {rows.map((row, i) => {
          const last = i === rows.length - 1;
          return (
            <span key={`${row.time}-${i}`} className="contents">
              <div className="py-[6px] text-eq-neutral-500 tabular-nums">{row.time}</div>
              <div className="flex flex-col items-center">
                <span className={cn("mt-[10px] size-2 shrink-0 rounded-full", i === 0 ? "bg-eq-neutral-500" : "bg-primary")} />
                {!last ? <span className="w-px flex-1 bg-eq-neutral-800" /> : null}
              </div>
              <div className={cn("pt-[6px]", last ? "pb-0" : "pb-[14px]")}>
                <div className="font-medium">{row.title}</div>
                {row.detail ? <div className="mt-[2px] text-eq-neutral-500">{row.detail}</div> : null}
              </div>
            </span>
          );
        })}
      </div>
      {note ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-eq-neutral-700 px-3 py-[9px] text-eq-neutral-400">
          <Icon icon={Mail} size={16} className="size-[14px] text-primary" />
          {note}
        </div>
      ) : null}
    </div>
  );
}
