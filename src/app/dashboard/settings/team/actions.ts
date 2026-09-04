"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { assertCanAddMember } from "@/lib/billing";
import { buildInviteEmail } from "@/lib/email/invite";
import { sendEmail } from "@/lib/email/send";
import type { CompanyMember, Invitation, UserRole } from "@/lib/types";

function inviteUrlFor(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/invite/${token}`;
}

async function sendInviteEmail(companyName: string, email: string, role: UserRole, inviteUrl: string) {
  const { subject, html, text } = buildInviteEmail({ companyName, inviteUrl, role });
  await sendEmail({ to: email, subject, html, text });
}

export async function inviteMember(formData: FormData) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "technician") as UserRole;

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email" };
  }
  if (role !== "owner" && role !== "technician") {
    return { error: "Invalid role" };
  }

  const limitError = await assertCanAddMember();
  if (limitError) {
    return { error: limitError.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      company_id: ctx.profile.company_id,
      email,
      role,
      invited_by: ctx.profile.id,
    })
    .select("token")
    .single<{ token: string }>();

  if (error) {
    if (error.code === "23505") {
      return { error: "There's already a pending invitation for that email" };
    }
    return { error: error.message };
  }

  const inviteUrl = inviteUrlFor(data.token);
  await sendInviteEmail(ctx.company.name, email, role, inviteUrl);

  revalidatePath("/dashboard/settings/team");
  return { success: true, inviteUrl };
}

export async function resendInvite(id: string) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }

  const supabase = await createClient();
  const { data: invite, error: fetchError } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Invitation>();

  if (fetchError || !invite) {
    return { error: "Invitation not found" };
  }
  if (invite.status !== "pending") {
    return { error: "This invitation is no longer pending" };
  }

  const { error: updateError } = await supabase
    .from("invitations")
    .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
    .eq("id", id);

  if (updateError) {
    return { error: updateError.message };
  }

  const inviteUrl = inviteUrlFor(invite.token);
  await sendInviteEmail(ctx.company.name, invite.email, invite.role, inviteUrl);

  revalidatePath("/dashboard/settings/team");
  return { success: true, inviteUrl };
}

export async function revokeInvite(id: string) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/team");
  return { success: true };
}

export async function updateMemberRole(userId: string, role: UserRole) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_role", {
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/team");
  return { success: true };
}

export async function removeMember(userId: string) {
  const ctx = await requireOwner();
  if (!ctx) {
    return { error: "Only owners can manage this" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_user_id: userId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/settings/team");
  return { success: true };
}

export async function getTeamData(): Promise<{ members: CompanyMember[]; invitations: Invitation[] }> {
  const supabase = await createClient();

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase.rpc("get_company_members"),
    supabase
      .from("invitations")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Invitation[]>(),
  ]);

  return {
    members: (members as CompanyMember[] | null) ?? [],
    invitations: invitations ?? [],
  };
}
