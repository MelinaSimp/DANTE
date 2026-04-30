// /planning — RIA planning index.
//
// Bento header with the four signal categories (Roth, RMD, TLH,
// beneficiary), each tile showing the active count + top finding.
// Below: a unified active-signals feed sorted by severity then date.
//
// Hidden (redirected) for non-advisor workspaces. Realtors get
// nothing useful here.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import PlanningClient from "./PlanningClient";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  // Realtor workspaces get redirected — Roth / RMD / TLH /
  // beneficiary mismatch are RIA-only signals.
  if (ctx.industry && ctx.industry !== "financial_advisor") {
    redirect("/dashboard");
  }

  return (
    <AppShell {...ctx}>
      <PlanningClient />
    </AppShell>
  );
}
