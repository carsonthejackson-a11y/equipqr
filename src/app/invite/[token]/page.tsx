import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PublicInvitation } from "@/lib/types";
import { AcceptInviteForm } from "./accept-invite-form";

const ROLE_LABEL: Record<PublicInvitation["role"], string> = {
  owner: "an owner",
  technician: "a technician",
};

const STATUS_MESSAGE: Record<Exclude<PublicInvitation["status"], "pending">, { title: string; body: string }> = {
  accepted: {
    title: "Already accepted",
    body: "This invitation has already been accepted. If that was you, just log in.",
  },
  revoked: {
    title: "Invitation revoked",
    body: "This invitation has been revoked by the company. Ask an owner to send a new one.",
  },
  expired: {
    title: "Invitation expired",
    body: "This invitation link has expired. Ask an owner to send you a new one.",
  },
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_invitation", { p_token: token });
  const invite = data as PublicInvitation | null;

  if (!invite) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Invitation not found</CardTitle>
          <CardDescription>
            This invitation link is invalid. Double-check the link, or ask the company owner to
            resend it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} nativeButton={false} className="w-full">
            Go to login
          </Button>
        </CardContent>
      </InviteShell>
    );
  }

  if (invite.status !== "pending") {
    const { title, body } = STATUS_MESSAGE[invite.status];
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} nativeButton={false} className="w-full">
            Go to login
          </Button>
        </CardContent>
      </InviteShell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roleLabel = ROLE_LABEL[invite.role];

  if (!user) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>You&apos;re invited</CardTitle>
          <CardDescription>
            <strong>{invite.company_name}</strong> invited <strong>{invite.email}</strong> to join
            as {roleLabel} on EquipQR.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            render={<Link href={`/signup?invite=${token}`} />}
            nativeButton={false}
            className="w-full"
          >
            Create account
          </Button>
          <Button
            render={<Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} />}
            nativeButton={false}
            variant="outline"
            className="w-full"
          >
            Log in
          </Button>
        </CardContent>
      </InviteShell>
    );
  }

  const emailMismatch = (user.email ?? "").toLowerCase() !== invite.email.toLowerCase();

  if (emailMismatch) {
    return (
      <InviteShell>
        <CardHeader>
          <CardTitle>Wrong account</CardTitle>
          <CardDescription>
            You&apos;re logged in as <strong>{user.email}</strong>, but this invitation was sent to{" "}
            <strong>{invite.email}</strong>. Log out and log back in with that email to accept it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <CardHeader>
        <CardTitle>You&apos;re invited</CardTitle>
        <CardDescription>
          <strong>{invite.company_name}</strong> invited you to join as {roleLabel} on EquipQR.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInviteForm token={token} defaultFullName={(user.user_metadata?.pending_full_name as string) ?? ""} />
      </CardContent>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-6">
        <Logo className="justify-center" />
        <Card>{children}</Card>
      </div>
    </div>
  );
}
