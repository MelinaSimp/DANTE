// app/lease-abstractor/page.tsx

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import LeaseAbstractorClient from "./LeaseAbstractorClient";

export const metadata: Metadata = {
  title: "Lease Abstractor — Drift AI",
  description: "Extract key terms from commercial leases with AI. Upload a PDF and get a structured abstract in seconds.",
};

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
