// Q-45: shown while the request, equipment, media (signed URLs) and activity
// queries round-trip. Mirrors this page's actual shape — back link, header
// with priority/status/assigned controls, the mobile-only quick-actions
// row, then a main column of cards next to a narrower sidebar — so the
// layout doesn't jump when the content lands. Same convention as
// r/[token]/loading.tsx and the generic dashboard/loading.tsx fallback.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-4 w-32 rounded bg-muted" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-muted" />
          <div className="h-4 w-40 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-24 rounded-md bg-muted" />
          <div className="h-9 w-24 rounded-md bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-11 w-full rounded-lg bg-muted" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div className="h-28 w-full rounded-xl bg-muted" />
          <div className="h-40 w-full rounded-xl bg-muted" />
          <div className="h-24 w-full rounded-xl bg-muted" />
          <div className="h-48 w-full rounded-xl bg-muted" />
        </div>
        <div className="space-y-6">
          <div className="h-32 w-full rounded-xl bg-muted" />
          <div className="h-24 w-full rounded-xl bg-muted" />
          <div className="h-24 w-full rounded-xl bg-muted" />
          <div className="h-28 w-full rounded-xl bg-muted" />
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
