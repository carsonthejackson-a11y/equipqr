import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { FEATURES } from "@/lib/features";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The pre-printed QR batch feature (the only thing under /admin today) is
  // parked for launch — see docs/BATCH-QR.md. Treat the whole section as
  // absent rather than gating each page individually.
  if (!FEATURES.batchQr) {
    notFound();
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  if (!isAdmin) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-lg font-medium">Not authorized</p>
        <p className="text-muted-foreground">This account doesn&apos;t have platform admin access.</p>
      </div>
    );
  }

  return (
    <div className="min-h-svh">
      <header className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            Admin
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Back to dashboard
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
