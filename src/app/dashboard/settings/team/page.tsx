import { requireOwner } from "@/lib/auth";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MembersTable } from "./members-table";
import { PendingInvitations } from "./pending-invitations";
import { getTeamData } from "./actions";

export default async function TeamPage() {
  const ctx = await requireOwner();

  if (!ctx) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-muted-foreground">Manage who has access to your company.</p>
        </div>
        <OwnerOnlyCard message="Only company owners can manage team members and invitations." />
      </div>
    );
  }

  const { members, invitations } = await getTeamData();
  const pendingInvitations = invitations.filter((invite) => invite.status === "pending");
  const ownerCount = members.filter((member) => member.role === "owner").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-muted-foreground">Manage who has access to {ctx.company.name}.</p>
        </div>
        <InviteMemberDialog />
      </div>

      <MembersTable members={members} currentUserId={ctx.profile.id} ownerCount={ownerCount} />

      <PendingInvitations invitations={pendingInvitations} />
    </div>
  );
}
