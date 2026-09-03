"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PublicInvitation } from "@/lib/types";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [serverError, setServerError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [invite, setInvite] = useState<PublicInvitation | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteToken);

  // Signing up via an invite: no company to create, and the login email is
  // locked to whoever the invite was sent to.
  const schema = z
    .object({
      companyName: inviteToken ? z.string().optional() : z.string().min(2, "Company name is required"),
      notificationEmail: inviteToken ? z.string().optional() : z.string().email("Enter a valid email"),
      fullName: z.string().min(1, "Your name is required"),
      email: z.string().email("Enter a valid email"),
      password: z.string().min(8, "At least 8 characters"),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!inviteToken) return;

    let cancelled = false;
    const supabase = createClient();

    supabase
      .rpc("get_invitation", { p_token: inviteToken })
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoadingInvite(false);

        if (error || !data) {
          setInviteError("This invitation link is invalid.");
          return;
        }

        const result = data as PublicInvitation;
        if (result.status !== "pending") {
          setInviteError(
            result.status === "expired"
              ? "This invitation has expired. Ask the owner for a new one."
              : result.status === "accepted"
                ? "This invitation has already been accepted."
                : "This invitation has been revoked."
          );
          return;
        }

        setInvite(result);
        setValue("email", result.email);
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, setValue]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: inviteToken
          ? {
              pending_full_name: values.fullName,
              pending_invite_token: inviteToken,
            }
          : {
              pending_company_name: values.companyName,
              pending_notification_email: values.notificationEmail,
              pending_full_name: values.fullName,
            },
      },
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    if (data.session) {
      router.push(inviteToken ? `/invite/${inviteToken}` : "/dashboard");
      router.refresh();
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent you a confirmation link. Click it, then come back and log in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} nativeButton={false} className="w-full">
            Go to login
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (inviteToken && inviteError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Can&apos;t create account</CardTitle>
          <CardDescription>{inviteError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/login" />} nativeButton={false} className="w-full">
            Go to login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{invite ? `Join ${invite.company_name}` : "Create your company account"}</CardTitle>
        <CardDescription>
          {invite
            ? `Set up your login to join as ${invite.role === "owner" ? "an owner" : "a technician"}.`
            : "Set up EquipQR for your service company."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

          {!inviteToken && (
            <>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" {...register("companyName")} />
                {errors.companyName && (
                  <p className="text-sm text-destructive">{errors.companyName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notificationEmail">Notification email</Label>
                <Input id="notificationEmail" type="email" {...register("notificationEmail")} />
                <p className="text-sm text-muted-foreground">
                  New service requests will be emailed here.
                </p>
                {errors.notificationEmail && (
                  <p className="text-sm text-destructive">{errors.notificationEmail.message}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="fullName">Your name</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Login email</Label>
            <Input
              id="email"
              type="email"
              readOnly={!!invite}
              disabled={loadingInvite}
              className={invite ? "bg-muted" : undefined}
              {...register("email")}
            />
            {invite && (
              <p className="text-sm text-muted-foreground">Locked to your invitation&apos;s email.</p>
            )}
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register("password")} />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting || loadingInvite}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href={inviteToken ? `/login?next=${encodeURIComponent(`/invite/${inviteToken}`)}` : "/login"} className="underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
