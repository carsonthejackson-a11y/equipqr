// Shown for both a genuinely unknown dispatch token (P0002) and a closed one
// — declined, or its parent request resolved/canceled (P0001). Either way
// there is nothing actionable left behind this link, and the vendor has no
// account to sign into for another way in — no "back to home" link, unlike
// the app-wide not-found page.

export default function VendorDispatchNotFound() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">This link is no longer active</h1>
      <p className="text-muted-foreground">
        This work order has been closed, or the link has expired. If you still need to reach
        someone about it, use the phone number in the original email.
      </p>
    </div>
  );
}
