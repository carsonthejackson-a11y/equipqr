"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import "./globals.css";

// global-error replaces the root layout when the root layout itself throws,
// so it can't rely on RootLayout — it must define its own <html>/<body> and
// doesn't get RootLayout's fonts or <Toaster/>. It also can't export
// `metadata` (error boundaries must be Client Components).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center font-sans">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">EquipQR hit a snag</h1>
          <p className="text-muted-foreground">
            Something went wrong loading the app. The error&apos;s been logged — try reloading.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
          )}
        </div>
        <Button onClick={() => reset()}>Try again</Button>
      </body>
    </html>
  );
}
