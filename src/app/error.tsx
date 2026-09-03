"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function Error({
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
    <div className="mx-auto flex min-h-svh max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Logo className="justify-center" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">
          Our side, not yours — the error&apos;s been logged. Give it another try.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
        )}
      </div>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
