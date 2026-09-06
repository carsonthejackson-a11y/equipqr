import Link from "next/link";

/**
 * Tiny footer affordance on the customer scan page: a technician who isn't
 * signed in on this phone can get to the staff view in one tap and come
 * straight back to this sticker. When staff are previewing the customer page
 * (`?view=customer`) it flips to "Back to staff view".
 */
export function StaffSignInLink({ qrToken, isStaffPreview }: { qrToken: string; isStaffPreview: boolean }) {
  const href = isStaffPreview ? `/e/${qrToken}` : `/login?next=${encodeURIComponent(`/e/${qrToken}`)}`;
  return (
    <p className="px-4 pb-1 text-center text-xs text-muted-foreground">
      <Link href={href} className="underline underline-offset-2">
        {isStaffPreview ? "Back to staff view" : "Service technician? Sign in"}
      </Link>
    </p>
  );
}
