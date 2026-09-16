import type { Metadata } from "next";
import { CodeEntryForm } from "@/components/public/code-entry-form";
import { PoweredBy } from "@/components/public/brand-shell";

// Every sticker's caption tells a customer to type their code at
// equipqr.co/e when they can't scan (Q-06) — this is where that lands. No
// company is known yet at this point, so there's nothing to brand with; the
// resolved company's own colours and logo take over on /e/<code>.

export const metadata: Metadata = {
  title: "Enter your sticker code",
  robots: { index: false },
};

export default function CodeEntryPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-sm flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Have a sticker code?</h1>
          <p className="text-muted-foreground">
            Type the code printed under the QR code to find your equipment.
          </p>
        </div>
        <CodeEntryForm autoFocus />
      </main>
      <PoweredBy />
    </div>
  );
}
