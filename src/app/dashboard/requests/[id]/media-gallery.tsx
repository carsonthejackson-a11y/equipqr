import type { MediaKind } from "@/lib/types";

type MediaItem = { url: string; media_type: MediaKind };

export function MediaGallery({ items }: { items: MediaItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No photos or videos attached.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item, i) =>
        item.media_type === "video" ? (
          <video key={i} src={item.url} controls className="aspect-square rounded-md border object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={item.url}
            alt="Service request attachment"
            className="aspect-square rounded-md border object-cover"
          />
        )
      )}
    </div>
  );
}
