// app/lease-abstractor/page.tsx

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import LeaseAbstractorClient from "./LeaseAbstractorClient";

export const dynamic = "force-dynamic";

export default async function LeaseAbstractorPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <LeaseAbstractorClient />
    </AppShell>
  );
}
