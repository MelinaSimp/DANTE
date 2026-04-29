// app/audit/page.tsx — auth-gated wrapper for the audit log surface.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AuditClient from "./AuditClient";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <AuditClient />
    </AppShell>
  );
}
