// app/autopilot/page.tsx

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AutopilotClient from "./AutopilotClient";

export const metadata: Metadata = {
  title: "Autopilot — Drift AI",
  description:
    "The autonomous pipeline. Drop a document in the vault and Drift classifies it and runs the right analysis — rent rolls get underwritten automatically — into a review feed.",
};

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <AutopilotClient />
    </AppShell>
  );
}
