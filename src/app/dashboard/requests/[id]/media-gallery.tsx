import type { MediaKind, ServiceRequestMedia } from "@/lib/types";

// ---- Next roadmap (migration 0019 / workstream A) ----
// Staff close-out photos (`origin: "staff"`) get their own labeled group
// with captions, plus a signature block when the request was signed off —
// both optional so this stays a plain "no photos" empty state for every
// request closed the old way.

type MediaItem = { url: string; media_type: MediaKind } & Partial<
  Pick<ServiceRequestMedia, "origin" | "caption">
>;

export type MediaGallerySignature = {
  url: string;
  signedByName: string | null;
  signedAt: string | null;
};

function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item, i) =>
        item.media_type === "video" ? (
          <video key={i} src={item.url} controls className="aspect-square rounded-md border object-cover" />
        ) : (
          <figure key={i} className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.caption ?? "Service request attachment"}
              className="aspect-square w-full rounded-md border object-cover"
            />
            {item.caption && (
              <figcaption className="text-center text-xs text-muted-foreground">{item.caption}</figcaption>
            )}
          </figure>
        )
      )}
    </div>
  );
}

export function MediaGallery({
  items,
  signature,
}: {
  items: MediaItem[];
  signature?: MediaGallerySignature | null;
}) {
  const staffItems = items.filter((item) => item.origin === "staff");
  const customerItems = items.filter((item) => item.origin !== "staff");

  if (items.length === 0 && !signature) {
    return <p className="text-sm text-muted-foreground">No photos or videos attached.</p>;
  }

  return (
    <div className="space-y-5">
      {customerItems.length > 0 && <MediaGrid items={customerItems} />}

      {staffItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Technician photos</p>
          <MediaGrid items={staffItems} />
        </div>
      )}

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">No photos or videos attached.</p>
      )}

      {signature && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Customer sign-off</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signature.url} alt="Customer signature" className="h-24 rounded-md border bg-white object-contain" />
          <p className="text-sm text-muted-foreground">
            Signed by {signature.signedByName ?? "the customer"}
            {signature.signedAt ? ` on ${new Date(signature.signedAt).toLocaleDateString()}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
