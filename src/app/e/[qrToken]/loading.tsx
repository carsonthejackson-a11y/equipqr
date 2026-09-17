// Shown while resolve_qr_code() round-trips — this page is usually opened
// by scanning a QR code on a phone with a weak signal, where that round
// trip is not instant. Mirrors the real page's shape (header bar, photo,
// title, action rows) so the layout doesn't jump when the content lands.
// Neutral grey, not the company's brand colour — that isn't known until the
// RPC resolves (C1-04).
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg animate-pulse flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="h-9 w-9 shrink-0 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-2">
        <div className="aspect-[4/3] w-full rounded-xl bg-muted" />

        <div className="space-y-2">
          <div className="h-7 w-3/4 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>

        <div className="space-y-3">
          <div className="h-14 w-full rounded-xl bg-muted" />
          <div className="h-14 w-full rounded-xl bg-muted" />
          <div className="h-14 w-full rounded-xl bg-muted" />
        </div>
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  );
}
