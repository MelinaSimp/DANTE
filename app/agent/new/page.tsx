// app/agent/new/page.tsx
//
// Conversational agent builder ("Build by Chatting"). Server page
// mirrors app/agent/page.tsx: fetch workspace context, mount the
// client under AppShell.

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AgentArchitectClient from "./AgentArchitectClient";

export const metadata: Metadata = {
  title: "Build an agent — Dante",
  description: "Describe what you want and Dante builds the agent with you.",
};

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <AgentArchitectClient />
    </AppShell>
  );
}
