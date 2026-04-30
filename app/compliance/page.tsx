// /compliance — CCO dashboard.
//
// Single-page hub with five sections:
//   1. Compliance flags (existing)            — pending review queue
//   2. Marketing reviews (Phase 3 item 19)    — campaigns awaiting CCO sign-off
//   3. Advertising reviews (Phase 3 item 23)  — testimonials / endorsements
//   4. ADV drafts (Phase 3 item 20)           — Form ADV Part 2A in flight
//   5. OBA records (Phase 3 item 22)          — outside business activities
// Plus a books-and-records export button (Phase 3 item 21) at the
// top of the page.
//
// Hidden for non-advisor workspaces (realtor industry → /work).

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ComplianceClient from "./ComplianceClient";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  if (ctx.industry && ctx.industry !== "financial_advisor") {
    redirect("/work");
  }

  return (
    <AppShell {...ctx}>
      <ComplianceClient />
    </AppShell>
  );
}
