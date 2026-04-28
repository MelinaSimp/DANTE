// app/review-tables/page.tsx — auth gate; data fetched client-side.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import ReviewTablesListClient from "./ReviewTablesListClient";

export const dynamic = "force-dynamic";

export default async function ReviewTablesPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <ReviewTablesListClient />
    </AppShell>
  );
}
