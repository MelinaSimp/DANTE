// app/site-scan/page.tsx

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import SiteScanClient from "./SiteScanClient";

export const metadata: Metadata = {
  title: "Site Scan — Dante",
  description: "Scan commercial properties and trade areas for void analysis, demographics, and competitor mapping.",
};

export const dynamic = "force-dynamic";

export default async function SiteScanPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <SiteScanClient />
    </AppShell>
  );
}
