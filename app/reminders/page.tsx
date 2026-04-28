// app/reminders/page.tsx — auth gate; data fetched client-side.

import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/shell/workspace-context";
import AppShell from "@/components/shell/AppShell";
import RemindersClient from "./RemindersClient";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const ctx = await getShellContext();
  if (!ctx) redirect("/auth");
  return (
    <AppShell {...ctx}>
      <RemindersClient />
    </AppShell>
  );
}
