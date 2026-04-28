// app/properties/page.tsx
//
// Properties list. Currently surfaced primarily for real-estate
// workspaces — financial-advisor workspaces won't see the nav link
// from the dashboard, but the route is workspace-isolated so an FA
// who finds the URL won't see anyone else's data.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import PropertiesClient from "./PropertiesClient";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <PropertiesClient />
    </AppShell>
  );
}
