"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
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
import type { CompanyKind, PublicInvitation } from "@/lib/types";
import { KindStep } from "@/components/kind-step";
import { isRateLimitError } from "@/lib/auth-errors";
import { isPlanId } from "@/lib/plans";

// A generous, non-annoying cooldown on the resend button — not a security
// control (Supabase enforces the real rate limit server-side), just a guard
// against someone mashing the button before the first email can land.
const RESEND_COOLDOWN_MS = 30_000;

// §2 shared trial copy, restated per kind right under the kind picker so
// "free trial" doesn't sound like a credit-card trap either way
// (docs/QOL-CONTINUITY-BRIEF.md item 8).
const TRIAL_REASSURANCE: Record<CompanyKind, string> = {
  service_provider:
    "14 days free, no card required. If your trial ends before you choose a plan, your dashboard pauses — your stickers, the customer request page, and your data all keep working.",
  equipment_owner:
    "14 days of full Kitchen features, then your account stays on Free for good — 1 location, 10 units, no card required, never locked.",
};

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  // §3.2.1: ?kind=owner / ?kind=provider preselects; anything else (or
  // nothing) defaults to service_provider. Hidden entirely once an invite
  // token is present — an invited teammate is joining an existing company,
  // whose kind was already chosen by whoever signed it up.
  const [kind, setKind] = useState<CompanyKind>(
    searchParams.get("kind") === "owner" ? "equipment_owner" : "service_provider"
  );
  // Carried through to auth user metadata for a later step (checkout right
  // after onboarding) to read — nothing here acts on it yet, so an unknown
  // value is simply dropped rather than trusted (same defensive stance as
  // pendingCompanyKind() in dashboard/layout.tsx for pending_company_kind).
  const rawPlan = searchParams.get("plan");
  const pendingPlanId = rawPlan && isPlanId(rawPlan) ? rawPlan : null;

  const [serverError, setServerError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendReady, setResendReady] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [invite, setInvite] = useState<PublicInvitation | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteToken);
  const [showPassword, setShowPassword] = useState(false);

  // Signing up via an invite: no company to create, and the login email is
  // locked to whoever the invite was sent to. One email total (it doubles
  // as the initial notification address for a new company — a disclosure
  // next to the field says so) and no confirm-password field — show/hide
  // on the single password field serves the same typo-catching purpose
  // (docs/QOL-CONTINUITY-BRIEF.md item 8).
  const schema = z.object({
    companyName: inviteToken ? z.string().optional() : z.string().min(2, "Company name is required"),
    fullName: z.string().min(1, "Your name is required"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
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
              // The login email doubles as the initial notification
              // address (item 8's "one email") — editable later in
              // Settings, same as pending_plan_id below is only a hint.
              pending_notification_email: values.email,
              pending_full_name: values.fullName,
              pending_company_kind: kind,
              ...(pendingPlanId ? { pending_plan_id: pendingPlanId } : {}),
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
      setSentToEmail(values.email);
      setCheckEmail(true);
      armResendCooldown();
    }
  }

  function armResendCooldown() {
    setResendReady(false);
    setTimeout(() => setResendReady(true), RESEND_COOLDOWN_MS);
  }

  async function handleResend() {
    if (!sentToEmail) return;
    setResending(true);
    setResendError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email: sentToEmail });
    setResending(false);

    // Same non-enumeration rule as the forgot-password flow: only a real
    // rate limit is safe to show verbatim, since an "already confirmed" or
    // "no such user" error would leak account existence.
    if (error && isRateLimitError(error)) {
      setResendError(error.message);
      return;
    }
    armResendCooldown();
  }

  if (checkEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to {sentToEmail}. Click it, then come back and log in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resendError && (
            <Alert variant="destructive">
              <AlertDescription>{resendError}</AlertDescription>
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
            : kind === "equipment_owner"
              ? "Set up EquipQR for your business."
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
              <KindStep value={kind} onChange={setKind} />
              <p className="text-sm text-muted-foreground">{TRIAL_REASSURANCE[kind]}</p>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" {...register("companyName")} />
                {errors.companyName && (
                  <p className="text-sm text-destructive">{errors.companyName.message}</p>
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
            {invite ? (
              <p className="text-sm text-muted-foreground">Locked to your invitation&apos;s email.</p>
            ) : (
              !inviteToken && (
                <p className="text-sm text-muted-foreground">
                  New service requests will be sent here by default — change that anytime in
                  Settings.
                </p>
              )
            )}
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                className="pr-8"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
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
