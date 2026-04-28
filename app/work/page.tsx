// app/work/page.tsx — unified work queue. Auth gated; data fetched
// client-side from /api/work/queue.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import WorkClient from "./WorkClient";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <WorkClient />
    </AppShell>
  );
}
