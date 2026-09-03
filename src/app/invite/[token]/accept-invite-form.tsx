"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvite } from "./actions";

export function AcceptInviteForm({
  token,
  defaultFullName,
}: {
  token: string;
  defaultFullName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(defaultFullName);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    const result = await acceptInvite(token, fullName);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Full name"
        />
      </div>
      <Button className="w-full" onClick={handleAccept} disabled={submitting}>
        {submitting ? "Joining..." : "Accept invitation"}
      </Button>
    </div>
  );
}
