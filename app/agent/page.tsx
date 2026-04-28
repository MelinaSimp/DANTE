// app/agent/page.tsx
//
// Server page for the agent roster. Fetches workspace context for the
// AppShell, then mounts the existing client roster underneath. The
// roster itself stays in AgentRosterClient.tsx as before.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AgentRosterClient from "./AgentRosterClient";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <AgentRosterClient />
    </AppShell>
  );
}
