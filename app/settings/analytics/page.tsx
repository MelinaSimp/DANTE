// /settings/analytics — workspace analytics dashboard.
//
// Pipeline KPIs, activity metrics, workflow health, and spend
// trends. Owner-only. Calls /api/me/analytics and
// /api/dante/workflows/stats for data.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import AnalyticsClient from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");

  return (
    <AppShell {...ctx}>
      <AnalyticsClient />
    </AppShell>
  );
}
