// /settings/integrations — Phase 4 + Phase 5 connection hub.
//
// Renders the provider registry merged with this workspace's
// integration_connections. Connect / Sync / Disconnect actions live
// in the client component.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import IntegrationsClient from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <IntegrationsClient />
    </AppShell>
  );
}
