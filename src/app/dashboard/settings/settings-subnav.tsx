import { getCurrentProfile } from "@/lib/auth";
import { SettingsSubnavClient } from "./settings-subnav-client";

// Async Server Component wrapper: fetches the two things the tab list needs
// to filter itself — the company's kind (C1-06) and whether this viewer is
// an owner (Q-16, since every settings page but Account is requireOwner()-
// gated — see settings-subnav-client.tsx) — so every one of this component's
// call sites stays exactly `<SettingsSubnav />`, with no prop to thread
// through pages that don't otherwise need this data. getCurrentProfile()
// redirects if somehow unauthenticated, but every caller already renders
// inside /dashboard, which the dashboard layout itself already guards —
// this never actually redirects in practice.
export async function SettingsSubnav() {
  const { profile, company } = await getCurrentProfile();
  return <SettingsSubnavClient kind={company.kind} isOwner={profile.role === "owner"} />;
}
