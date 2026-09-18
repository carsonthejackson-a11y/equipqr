// The Suspense fallback for the status view — shown while the plan-flags
// lookup that settles branding round-trips. Mirrors the real page's shape so
// the layout doesn't jump when the content lands — this page is usually
// opened from a phone on a job site, where that round-trip is not instant.
//
// Deliberately NOT a loading.tsx. A loading.tsx streams before page.tsx has
// looked the token up, which commits the HTTP status to 200 before notFound()
// gets to run — an unknown token then rendered the not-found UI with a 200
// (a soft 404). page.tsx looks the token up first and only then renders this
// behind an explicit <Suspense>.
export function StatusSkeleton() {
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
