// Shown while the status RPC round-trips. Mirrors the real page's shape so
// the layout doesn't jump when the content lands — this page is usually
// opened from a phone on a job site, where that round-trip is not instant.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-lg animate-pulse px-4 py-5">
      <div className="mb-6 h-9 w-40 rounded bg-muted" />
      <div className="mb-3 h-8 w-28 rounded-full bg-muted" />
      <div className="mb-2 h-7 w-3/4 rounded bg-muted" />
      <div className="mb-6 h-4 w-1/2 rounded bg-muted" />
      <div className="mb-3 h-20 w-full rounded-xl bg-muted" />
      <div className="h-32 w-full rounded-xl bg-muted" />
      <span className="sr-only">Loading your request…</span>
    </div>
  );
}
