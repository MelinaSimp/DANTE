// app/site-scan/page.tsx

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import SiteScanClient from "./SiteScanClient";

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
