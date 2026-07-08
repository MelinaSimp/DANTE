// app/vault/page.tsx
//
// Vault — workspace-scoped store of templates and documents. Auth
// gate only; data fetched client-side from /api/vault.

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import VaultClient from "./VaultClient";

export const metadata: Metadata = {
  title: "Vault — Dante",
  description: "Workspace document store. Upload templates, contracts, and files for AI-powered search and analysis.",
};

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
