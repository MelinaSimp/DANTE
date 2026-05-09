// /settings/team — workspace member roster, invite minting, removal.
//
// Owner / admin can invite + remove. Everyone can see the roster.
// All API calls live under /api/workspace/members + /invites.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import TeamClient from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <TeamClient />
    </AppShell>
  );
}
