# Teams

How a second (or third...) user joins a company, and what each role can do.

## Roles

| Capability | Owner | Technician |
| --- | --- | --- |
| View/manage customers, equipment, equipment types, requests | ✅ | ✅ |
| Company settings (name, notification email) | ✅ | ❌ |
| Team (invite, change roles, remove members) | ✅ | ❌ |
| Billing (future workstream) | ✅ | ❌ |
| Delete equipment types / customers | ✅ | ❌ (view/create/edit only) |

A technician who visits an owner-only page (`/dashboard/settings`,
`/dashboard/settings/team`) sees an "only owners can manage this" card
instead of the form. Owner-only nav items are hidden for technicians
entirely.

## Invitation lifecycle

1. An owner opens **Team** → **Invite member**, enters an email + role. This
   inserts a row into `invitations` (`status = 'pending'`, `token` a random
   48-char hex string, `expires_at` = now + 7 days) and emails a link to
   `/invite/{token}` via Resend. If Resend isn't configured, the invite is
   still created and the owner gets a "copy invite link" button instead.
2. The invitee opens the link:
   - **Not logged in** → "Create account" (`/signup?invite={token}`, which
     hides the company-creation fields and locks the email to the invited
     address) or "Log in" (`/login?next=/invite/{token}`).
   - **Logged in as the invited email** → "Accept invitation" creates their
     `profiles` row (with the invited role) and marks the invite accepted.
   - **Logged in as a different email** → told to log out and back in with
     the right account.
3. A company owner can **resend** (bumps `expires_at` by another 7 days and
   re-sends the email) or **revoke** a pending invite from the Team page at
   any time. Only one pending invite per (company, email) can exist — sending
   another to the same address requires revoking the first.
4. A stale invite (`expires_at` in the past) reads as `expired` everywhere
   it's surfaced (`get_invitation`, `accept_invitation`) even before anything
   updates the stored `status`; accepting one also flips it to `expired` in
   the table.

## Membership rules

- `accept_invitation` refuses if the caller already has a profile in a
  *different* company ("You already belong to a company").
- Owners change a teammate's role or remove them from **Team** → member row.
  Both are backed by `security definer` RPCs (`update_member_role`,
  `remove_member`) that re-check the caller is an owner of that same company
  server-side, regardless of what the client sends.
- Neither RPC lets the **last owner** demote or remove themselves — a
  company must always have at least one owner.

## Seats / billing

Invite creation has a `-- TODO(billing)` marker where a plan's member-count
limit should be enforced once the billing workstream ships; today there's no
cap.
