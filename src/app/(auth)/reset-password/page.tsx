import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session means there's no valid, just-verified recovery link behind
  // this visit — someone landed here directly, or the link already expired
  // and src/app/auth/confirm/route.ts already tried to bounce them to
  // /forgot-password. Either way, don't render a password form with nothing
  // to attach it to.
  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link expired</CardTitle>
          <CardDescription>
            This password reset link is invalid or has already been used. Request a new one to
            continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            render={<Link href="/forgot-password" />}
            nativeButton={false}
            className="w-full"
          >
            Request a new link
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm />;
}
