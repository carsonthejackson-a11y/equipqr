import { cn } from "@/lib/utils";

// A phone-frame mock built entirely from Tailwind + SVG — stands in for a
// screenshot of the /e/[qrToken] scan page at each step of the flow.

export function PhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-56 rounded-[2.25rem] border-[6px] border-foreground/90 bg-background p-1.5 shadow-xl shadow-foreground/10 dark:border-foreground/70",
        className
      )}
      aria-hidden="true"
    >
      <div className="absolute top-2.5 left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-foreground/90 dark:bg-foreground/70" />
      <div className="flex h-90 flex-col overflow-hidden rounded-[1.6rem] bg-card ring-1 ring-foreground/10">
        <div className="flex-1 overflow-hidden px-3 pt-7 pb-3">{children}</div>
        <div className="flex justify-center pb-2">
          <div className="h-1 w-20 rounded-full bg-foreground/20" />
        </div>
      </div>
    </div>
  );
}

function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block size-1.5 rounded-full", className)} />;
}

export function ScanScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <svg viewBox="0 0 100 100" className="size-20 text-foreground" fill="none">
        <rect x="8" y="8" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="7" />
        <rect x="62" y="8" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="7" />
        <rect x="8" y="62" width="30" height="30" rx="4" stroke="currentColor" strokeWidth="7" />
        <rect x="18" y="18" width="10" height="10" fill="currentColor" />
        <rect x="72" y="18" width="10" height="10" fill="currentColor" />
        <rect x="18" y="72" width="10" height="10" fill="currentColor" />
        <rect x="62" y="62" width="10" height="10" fill="currentColor" />
        <rect x="80" y="62" width="10" height="10" fill="currentColor" />
        <rect x="62" y="80" width="10" height="10" fill="currentColor" />
        <rect x="80" y="80" width="10" height="10" fill="currentColor" />
      </svg>
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-foreground">Point camera at sticker</p>
        <p className="text-[10px] text-muted-foreground">No app to download</p>
      </div>
    </div>
  );
}

export function GuideScreen() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="space-y-1 rounded-lg bg-muted px-2.5 py-2">
        <p className="text-[10px] font-medium text-foreground">Espresso Machine — Unit #14</p>
        <p className="text-[9px] text-muted-foreground">Is the machine powering on?</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-foreground">
          No lights at all
        </div>
        <div className="rounded-lg border border-primary/40 bg-accent px-2.5 py-1.5 text-[10px] font-medium text-accent-foreground">
          Powers on, no water flow
        </div>
        <div className="rounded-lg border border-border px-2.5 py-1.5 text-[10px] text-foreground">
          It&apos;s working now
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1.5">
        <Dot className="bg-primary" />
        <p className="text-[9px] text-muted-foreground">Ask the assistant a question…</p>
      </div>
    </div>
  );
}

export function RequestScreen() {
  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-[10px] font-medium text-foreground">Request service</p>
      <div className="space-y-1 rounded-lg border border-border p-2">
        <p className="text-[9px] text-muted-foreground">What&apos;s happening?</p>
        <div className="h-6 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border">
          <svg viewBox="0 0 24 24" className="size-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h3l2-2h6l2 2h3v12H4z" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>
        <div className="aspect-square rounded-lg bg-muted" />
        <div className="aspect-square rounded-lg bg-muted" />
      </div>
      <div className="mt-auto rounded-lg bg-primary py-1.5 text-center text-[10px] font-medium text-primary-foreground">
        Send request
      </div>
    </div>
  );
}
