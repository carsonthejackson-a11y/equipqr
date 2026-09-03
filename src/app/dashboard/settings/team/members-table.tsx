"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CompanyMember, UserRole } from "@/lib/types";
import { removeMember, updateMemberRole } from "./actions";

const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner",
  technician: "Technician",
};

export function MembersTable({
  members,
  currentUserId,
  ownerCount,
}: {
  members: CompanyMember[];
  currentUserId: string;
  ownerCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CompanyMember | null>(null);

  function handleRoleChange(member: CompanyMember, role: string | null) {
    if (!role || role === member.role) return;
    setPendingId(member.id);
    startTransition(async () => {
      const result = await updateMemberRole(member.id, role as UserRole);
      setPendingId(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${member.full_name ?? member.email} is now ${ROLE_LABEL[role as UserRole]}`);
      router.refresh();
    });
  }

  function handleRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    setPendingId(target.id);
    startTransition(async () => {
      const result = await removeMember(target.id);
      setPendingId(null);
      setRemoveTarget(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed ${target.full_name ?? target.email}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Members</h2>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.id === currentUserId;
              const isLastOwner = member.role === "owner" && ownerCount <= 1;
              const rowBusy = isPending && pendingId === member.id;

              return (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.full_name || "—"}
                    {isSelf && <span className="ml-1.5 text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleRoleChange(member, value)}
                      disabled={rowBusy || (isSelf && isLastOwner)}
                      items={{ owner: "Owner", technician: "Technician" }}
                    >
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue>
                          {(value: UserRole) => (
                            <Badge variant={value === "owner" ? "default" : "secondary"}>
                              {ROLE_LABEL[value]}
                            </Badge>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="technician">Technician</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={rowBusy || (isSelf && isLastOwner)}
                      title={
                        isSelf && isLastOwner
                          ? "You're the last owner — promote someone else first"
                          : "Remove member"
                      }
                      onClick={() => setRemoveTarget(member)}
                    >
                      <Trash2 className="text-destructive" />
                      <span className="sr-only">Remove {member.full_name ?? member.email}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
            <DialogDescription>
              {removeTarget?.full_name ?? removeTarget?.email} will immediately lose access to{" "}
              this company. This can&apos;t be undone — they&apos;d need a new invitation to rejoin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleRemove} disabled={isPending}>
              {isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
