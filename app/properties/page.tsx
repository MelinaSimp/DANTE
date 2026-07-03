// app/properties/page.tsx
//
// Properties list — deal pipeline for CRE brokerages. Workspace-
// isolated so each firm sees only their own data.

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import PropertiesClient from "./PropertiesClient";

export const metadata: Metadata = {
  title: "Properties — Dante",
  description: "Deal pipeline for commercial real estate. Track listings, offers, and closings.",
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
