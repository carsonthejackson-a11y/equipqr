"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const schema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  notificationEmail: z.string().email("Enter a valid email"),
  fullName: z.string().min(1, "Your name is required"),
});

type FormValues = z.infer<typeof schema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const supabase = createClient();

    const { error } = await supabase.rpc("create_company_and_profile", {
      p_company_name: values.companyName,
      p_notification_email: values.notificationEmail,
      p_full_name: values.fullName,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish setting up your company</CardTitle>
        <CardDescription>Just a couple more details before you get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {serverError && (
            <Alert variant="destructive">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}

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
            {errors.notificationEmail && (
              <p className="text-sm text-destructive">{errors.notificationEmail.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Your name</Label>
            <Input id="fullName" {...register("fullName")} />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Setting up..." : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
