// Q-45: generic fallback for any /dashboard/** page that doesn't have its own
// more specific loading.tsx (e.g. requests/[id]/loading.tsx). Mirrors the
// "title + subtitle + action, then a list of rows" shape most dashboard list
// pages share (Requests, Customers, Equipment, Schedule, Maintenance, ...) —
// same animate-pulse/bg-muted convention as r/[token]/loading.tsx. The
// dashboard layout's own <main className="p-6"> already supplies the page
// padding, so this only needs to fill that area.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="h-8 w-28 rounded-lg bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 w-full rounded-lg bg-muted" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
