"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Mail, RotateCw, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { Invitation } from "@/lib/types";
import { resendInvite, revokeInvite } from "./actions";

function inviteUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/invite/${token}`;
}

export function PendingInvitations({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — copy it from the address bar instead");
    }
  }

  function handleResend(invite: Invitation) {
    setPendingId(invite.id);
    startTransition(async () => {
      const result = await resendInvite(invite.id);
      setPendingId(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Invitation resent to ${invite.email}`);
      router.refresh();
    });
  }

  function handleRevoke(invite: Invitation) {
    setPendingId(invite.id);
    startTransition(async () => {
      const result = await revokeInvite(invite.id);
      setPendingId(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Revoked invitation to ${invite.email}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Pending invitations</h2>
      {invitations.length === 0 ? (
        <EmptyState icon={Mail} message="No pending invitations. Invite a teammate to get started." />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invite) => {
                const rowBusy = isPending && pendingId === invite.id;
                const expired = new Date(invite.expires_at) < new Date();

                return (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>
                      <Badge variant={invite.role === "owner" ? "default" : "secondary"}>
                        {invite.role === "owner" ? "Owner" : "Technician"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expired ? (
                        <span className="text-destructive">Expired</span>
                      ) : (
                        new Date(invite.expires_at).toLocaleDateString()
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Copy invite link"
                          onClick={() => copyLink(invite.token)}
                        >
                          <Copy />
                          <span className="sr-only">Copy invite link</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Resend invitation"
                          disabled={rowBusy}
                          onClick={() => handleResend(invite)}
                        >
                          <RotateCw />
                          <span className="sr-only">Resend invitation</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Revoke invitation"
                          disabled={rowBusy}
                          onClick={() => handleRevoke(invite)}
                        >
                          <X className="text-destructive" />
                          <span className="sr-only">Revoke invitation</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
