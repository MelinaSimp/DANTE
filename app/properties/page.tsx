// app/properties/page.tsx
//
// Records list — a simple pipeline view. Workspace-isolated so each
// team sees only their own data.

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import PropertiesClient from "./PropertiesClient";

export const metadata: Metadata = {
  title: "Records — Dante",
  description: "Track your records and pipeline in one place.",
};

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
