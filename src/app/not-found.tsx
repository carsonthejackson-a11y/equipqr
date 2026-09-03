import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Logo className="justify-center" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist, or the link may be out of date.
        </p>
      </div>
      <Button render={<Link href="/" />} nativeButton={false}>
        Back to home
      </Button>
    </div>
  );
}
