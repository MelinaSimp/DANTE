// app/underwriter/page.tsx

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import UnderwriterClient from "./UnderwriterClient";

export const metadata: Metadata = {
  title: "Underwriter — Drift AI",
  description:
    "Drop a rent roll and get a full multi-tab underwriting model — NOI, cap rate, IRR, and a 10-year DCF — with every figure traced to its source.",
};

export const dynamic = "force-dynamic";

export default async function UnderwriterPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <UnderwriterClient />
    </AppShell>
  );
}
