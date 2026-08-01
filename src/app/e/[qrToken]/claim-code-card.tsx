"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Equipment } from "@/lib/types";
import { claimCode } from "./actions";

export function ClaimCodeCard({
  token,
  unassignedEquipment,
}: {
  token: string;
  unassignedEquipment: Equipment[];
}) {
  const [equipmentId, setEquipmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await claimCode(token, equipmentId);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Code linked</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This sticker is now linked to that equipment. Scanning it from here on will show its
            troubleshooting guide.
          </p>
          <Button render={<Link href="/dashboard/equipment" />} nativeButton={false} className="w-full">
            Back to equipment
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign this QR code</CardTitle>
        <CardDescription>This code isn&apos;t linked to any equipment yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {unassignedEquipment.length === 0 ? (
          <p className="text-muted-foreground">
            You don&apos;t have any equipment waiting for a code. Create equipment first, then
            scan this sticker again.
          </p>
        ) : (
          <>
            <Select
              value={equipmentId}
              onValueChange={(v) => setEquipmentId(v ?? "")}
              items={Object.fromEntries(unassignedEquipment.map((e) => [e.id, e.name]))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select equipment" />
              </SelectTrigger>
              <SelectContent>
                {unassignedEquipment.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSubmit} disabled={submitting || !equipmentId} className="w-full">
              {submitting ? "Linking..." : "Link this code"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
