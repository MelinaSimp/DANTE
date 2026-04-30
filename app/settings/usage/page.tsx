// /settings/usage — workspace-internal cost dashboard.
//
// Shows the workspace owner where their LLM, voice, email, and SMS
// spend is going this month. Critical Phase 0 tooling: until this
// existed, we were flying blind on margin.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import UsageClient from "./UsageClient";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <UsageClient />
    </AppShell>
  );
}
