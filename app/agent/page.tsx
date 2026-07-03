// app/agent/page.tsx
//
// Server page for the agent roster. Fetches workspace context for the
// AppShell, then mounts the agent roster underneath.

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AgentRosterClient from "./AgentRosterClient";

export const metadata: Metadata = {
  title: "Agents — Dante",
  description: "Configure and manage the agents that work your brokerage's chat, email, and workflows.",
};

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
