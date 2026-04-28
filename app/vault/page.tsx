// app/vault/page.tsx
//
// Vault — workspace-scoped store of templates and documents. Auth
// gate only; data fetched client-side from /api/vault.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import VaultClient from "./VaultClient";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <VaultClient />
    </AppShell>
  );
}
