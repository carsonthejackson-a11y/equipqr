import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">EquipQR</h1>
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
    </div>
  );
}
