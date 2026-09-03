"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { updateFullName } from "./actions";

export function AccountForm({ fullName, email }: { fullName: string | null; email: string }) {
  const [nameError, setNameError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState(email);
  const [emailPending, setEmailPending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  async function handleNameSubmit(formData: FormData) {
    setNameError(null);
    const result = await updateFullName(formData);
    if (result?.error) {
      setNameError(result.error);
      return;
    }
    toast.success("Name updated");
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailError(null);

    if (!newEmail.trim() || newEmail.trim() === email) {
      setEmailError("Enter a different email address");
      return;
    }

    setEmailPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailPending(false);

    if (error) {
      setEmailError(error.message);
      return;
    }

    setEmailSent(true);
    toast.success("Confirmation emails sent");
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }

    setPasswordPending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordPending(false);

    if (error) {
      setPasswordError(error.message);
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setPasswordChanged(true);
    toast.success("Password updated");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name as your teammates see it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleNameSubmit} className="max-w-md space-y-4">
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" defaultValue={fullName ?? ""} required />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>Used to sign in and to receive notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleEmailSubmit} className="max-w-md space-y-4">
            {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            {emailSent && (
              <Alert>
                <AlertTitle>Check your inbox</AlertTitle>
                <AlertDescription>
                  We sent confirmation links to both your old and new email address. Your login
                  email won&apos;t change until you confirm from both.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                Changing this sends a confirmation email to both your current and new address —
                nothing changes until you confirm.
              </p>
            </div>
            <Button type="submit" disabled={emailPending}>
              {emailPending ? "Sending…" : "Update email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="max-w-md space-y-4">
            {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            {passwordChanged && (
              <Alert>
                <AlertTitle>Password updated</AlertTitle>
                <AlertDescription>Use your new password next time you sign in.</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" disabled={passwordPending}>
              {passwordPending ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
