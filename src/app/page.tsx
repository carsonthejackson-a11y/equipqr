import Link from "next/link";
import { QrCode, Wrench, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

const steps = [
  { icon: QrCode, label: "Scan the QR code on the equipment" },
  { icon: Wrench, label: "Walk through a quick troubleshooting guide" },
  { icon: ClipboardList, label: "Request service if it's still not fixed" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-16 text-center">
      <div className="space-y-4">
        <Logo className="justify-center" />
        <p className="max-w-md text-muted-foreground">
          Put a QR code on every piece of equipment. Customers scan it to troubleshoot, and
          request service when they need a hand.
        </p>
      </div>

      <div className="flex gap-3">
        <Button render={<Link href="/signup" />} nativeButton={false}>
          Get started
        </Button>
        <Button render={<Link href="/login" />} nativeButton={false} variant="outline">
          Log in
        </Button>
      </div>

      <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, label }, i) => (
          <div
            key={label}
            className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-sm"
          >
            <div className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Icon className="size-4.5" />
            </div>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{i + 1}.</span> {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
