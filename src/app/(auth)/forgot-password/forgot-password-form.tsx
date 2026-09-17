"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { isRateLimitError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

// A generous, non-annoying cooldown on the resend button — not a security
// control (Supabase enforces the real rate limit server-side), just a guard
// against someone mashing the button before the first email can land.
const RESEND_COOLDOWN_MS = 30_000;

// Requests a reset link and reports back only what's safe to show. Supabase
// itself never reveals whether `email` has an account for this call, so the
// only error worth surfacing verbatim is a genuine rate limit — anything
// else (including a silently-swallowed "no such user") collapses into the
// same "check your email" state a real send would produce.
async function requestReset(email: string): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Via /auth/confirm so both Supabase template styles work: the
    // recommended token_hash template links there directly, and the default
    // {{ .ConfirmationURL }} template redirects there with a PKCE `?code=`
    // (same-browser only), which the route exchanges for a session.
    redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
  });
  return error && isRateLimitError(error) ? error.message : null;
}

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const expired = searchParams.get("expired") === "1";

  const [serverError, setServerError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendReady, setResendReady] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function armCooldown() {
    setResendReady(false);
    setTimeout(() => setResendReady(true), RESEND_COOLDOWN_MS);
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const errorMessage = await requestReset(values.email);
    if (errorMessage) {
      setServerError(errorMessage);
      return;
    }
    setSentEmail(values.email);
    armCooldown();
  }

  async function handleResend() {
    if (!sentEmail) return;
    setResending(true);
    setServerError(null);
    const errorMessage = await requestReset(sentEmail);
    setResending(false);
    if (errorMessage) {
      setServerError(errorMessage);
      return;
    }
    armCooldown();
  }

  if (sentEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists for {sentEmail}, we sent a link to reset the password. It only
            works once, so request a new one below if it&apos;s expired.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={resending || !resendReady}
            onClick={handleResend}
          >
            {resending ? "Sending…" : "Resend email"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="underline">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the email you sign in with and we&apos;ll send you a link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {expired && (
            <Alert>
              <AlertTitle>That link expired</AlertTitle>
              <AlertDescription>
                Reset links only work once and expire after a while. Enter your email below to
                get a new one.
              </AlertDescription>
            </Alert>
          )}
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoFocus {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline">
            Back to login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
