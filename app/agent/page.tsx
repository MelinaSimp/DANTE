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
  title: "Voice AI — Drift AI",
  description: "Configure and manage voice agents that handle inbound calls for your brokerage.",
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
