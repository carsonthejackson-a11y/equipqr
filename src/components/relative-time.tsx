"use client";

import { useMemo, useSyncExternalStore } from "react";
import { formatRelativeTime } from "@/lib/format";

const TICK_MS = 30_000;

function subscribeTick(onChange: () => void) {
  const id = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(id);
}

/**
 * "3 minutes ago" that is safe to render from a client component.
 *
 * `formatRelativeTime()` depends on the clock, so the string the server
 * rendered can differ from the one the browser computes while hydrating
 * ("1 second ago" vs "2 seconds ago"); React then reports a hydration
 * mismatch and regenerates the tree on the client, which drops anything the
 * user already typed into the page. Here the server snapshot is a fixed tick,
 * so hydration renders the same string on both sides, and React re-renders
 * with the live tick straight afterwards (and every 30s from then on).
 */
export function RelativeTime({
  iso,
  className,
  title,
}: {
  iso: string;
  className?: string;
  title?: string;
}) {
  const tick = useSyncExternalStore(
    subscribeTick,
    () => Math.floor(Date.now() / TICK_MS),
    () => 0
  );
  // `tick` is not read by the formatter (it uses the clock directly); it is a
  // dependency purely so the label is recomputed on every store change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const text = useMemo(() => formatRelativeTime(iso), [iso, tick]);

  return (
    <time dateTime={iso} title={title} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
