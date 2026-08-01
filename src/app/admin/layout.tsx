import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
        <SignOutButton />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
